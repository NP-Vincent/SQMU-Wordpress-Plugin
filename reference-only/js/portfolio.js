import { connectWallet, disconnectWallet } from './wallet.js';
import { SQMU_ADDRESS, DISTRIBUTOR_ADDRESS, TRADE_ADDRESS } from './config.js';
import {
  fromStablecoinUnits,
  toStablecoinUnits,
  toSQMUUnits,
  fromSQMUUnits,
} from './units.js';

let provider;
let signer;
let sqmu;
let distributor;
let trade;
let paymentTokens = [];

// SQMU tokens use two decimal places
const DECIMALS = 2;
const MAX_TOKEN_ID = 100; // adjust if your token ids exceed this range
const erc20Abi = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

function formatUSD(bn) {
  // getPrice returns an integer amount in USD scaled by 100 (two decimals)
  const num = Number(fromStablecoinUnits(bn, 2));
  return 'USD ' + num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function setStatus(msg, color) {
  const el = document.getElementById('portfolio-status');
  el.innerHTML = color ? `<span style="color:${color};">${msg}</span>` : msg;
}

function setTradeStatus(msg, color) {
  const el = document.getElementById('trade-status');
  if (el) {
    el.innerHTML = color ? `<span style="color:${color};">${msg}</span>` : msg;
  }
}

function enforceColumnRatio() {
  const buttonsCol = document.querySelector('.tab-buttons');
  const contentCol = document.querySelector('.tab-content');
  if (!buttonsCol || !contentCol) return;
  buttonsCol.style.flex = '1';
  contentCol.style.flex = '4';
}

window.addEventListener('load', enforceColumnRatio);

async function ensureAllowance(tokenAddr, requiredAmount) {
  const erc20 = new ethers.Contract(tokenAddr, erc20Abi, signer);
  const owner = await signer.getAddress();
  const current = await erc20.allowance(owner, TRADE_ADDRESS);
  if (current.gte(requiredAmount)) return;
  const tx = await erc20.approve(TRADE_ADDRESS, requiredAmount);
  setTradeStatus('Approving payment token...');
  await tx.wait();
}

async function connect() {
  try {
    ({ provider, signer } = await connectWallet('portfolio-status'));
    const sqmuUrl = new URL('../abi/SQMU.json', import.meta.url);
    const sqmuRes = await fetch(sqmuUrl);
    const sqmuAbi = (await sqmuRes.json()).abi;
    // Use the signer so we can call setApprovalForAll when creating listings
    sqmu = new ethers.Contract(SQMU_ADDRESS, sqmuAbi, signer);
    const distUrl = new URL('../abi/AtomicSQMUDistributor.json', import.meta.url);
    const distRes = await fetch(distUrl);
    const distAbi = (await distRes.json()).abi;
    distributor = new ethers.Contract(DISTRIBUTOR_ADDRESS, distAbi, provider);
    const tradeUrl = new URL('../abi/SQMUTrade.json', import.meta.url);
    const tradeRes = await fetch(tradeUrl);
    const tradeAbi = (await tradeRes.json()).abi;
    trade = new ethers.Contract(TRADE_ADDRESS, tradeAbi, signer);
    const payAddrs = await distributor.getPaymentTokens();
    paymentTokens = await Promise.all(
      payAddrs.map(async (addr) => {
        const erc20 = new ethers.Contract(addr, erc20Abi, provider);
        let symbol = addr;
        let decimals = 18;
        try {
          decimals = await erc20.decimals();
          symbol = await erc20.symbol();
        } catch (e) {}
        return { address: addr, symbol, decimals };
      })
    );
    document.getElementById('disconnect').style.display = '';
    document.getElementById('connect').disabled = true;
    setStatus('Connected. Loading balances...', 'green');
    await displayBalances();
    await displayListings();
  } catch (err) {
    setStatus(err.message, 'red');
  }
}

async function displayBalances() {
  const owner = await signer.getAddress();
  const ids = [];
  const owners = [];
  for (let i = 1; i <= MAX_TOKEN_ID; i++) {
    ids.push(i);
    owners.push(owner);
  }
  const balances = await sqmu.balanceOfBatch(owners, ids);
  const tbody = document.querySelector('#portfolio-table tbody');
  tbody.innerHTML = '';
  let totalSqmu = 0;
  let totalUsd = ethers.BigNumber.from(0);
  for (let i = 0; i < ids.length; i++) {
    const amt = Number(fromSQMUUnits(balances[i]));
    if (amt === 0) continue;
    let priceBn;
    try {
      priceBn = await distributor.getPrice('SQMU' + ids[i], balances[i]);
    } catch (err) {
      // Skip unregistered tokens such as governance ID 0
      continue;
    }
    totalSqmu += amt;
    totalUsd = totalUsd.add(priceBn);
    const priceStr = formatUSD(priceBn);
    const row = document.createElement('tr');
    const code = `SQMU${ids[i]}`;
    const propTd = document.createElement('td');
    propTd.textContent = code;
    const balTd = document.createElement('td');
    balTd.textContent = amt.toFixed(DECIMALS);
    const valTd = document.createElement('td');
    valTd.textContent = priceStr;
    const amtTd = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'wp-block-input';
    input.min = '0';
    input.step = '0.01';
    amtTd.appendChild(input);
    const sellTd = document.createElement('td');
    const btnWrap = document.createElement('div');
    btnWrap.className = 'wp-block-buttons';
    const btnInner = document.createElement('div');
    btnInner.className = 'wp-block-button';
    const btn = document.createElement('button');
    btn.className = 'wp-block-button__link';
    btn.textContent = 'Sell';
    btnInner.appendChild(btn);
    btnWrap.appendChild(btnInner);
    sellTd.appendChild(btnWrap);
    row.appendChild(propTd);
    row.appendChild(balTd);
    row.appendChild(valTd);
    row.appendChild(amtTd);
    row.appendChild(sellTd);
    tbody.appendChild(row);

    btn.addEventListener('click', async () => {
      const raw = input.value;
      const amountVal = parseFloat(raw);
      if (!amountVal || amountVal <= 0) return;
      try {
        const amount = toSQMUUnits(amountVal);
        const approved = await sqmu.isApprovedForAll(await signer.getAddress(), TRADE_ADDRESS);
        if (!approved) {
          setTradeStatus('Approving SQMU transfer...');
          const tx0 = await sqmu.setApprovalForAll(TRADE_ADDRESS, true);
          await tx0.wait();
        }
        const tx = await trade.listToken(code, SQMU_ADDRESS, ids[i], amount);
        setTradeStatus('Listing tokens...');
        await tx.wait();
        setTradeStatus('Listing created', 'green');
        await displayBalances();
        await displayListings();
      } catch (err) {
        setTradeStatus(err.message, 'red');
      }
    });
  }
  document.getElementById('total-sqmu').textContent = totalSqmu.toFixed(DECIMALS);
  document.getElementById('total-usd').textContent = formatUSD(totalUsd);
  setStatus('Balances loaded', 'green');
}

async function displayListings() {
  if (!trade) return;
  const tbody = document.querySelector('#listing-table tbody');
  tbody.innerHTML = '';
  try {
    const listings = await trade.getActiveListings();
    for (const l of listings) {
      if (Number(l.tokenId) === 0) continue;
      const available = Number(fromSQMUUnits(l.amountListed));
      const priceBn = await distributor.getPrice(l.propertyCode, toSQMUUnits(1));
      const priceStr = formatUSD(priceBn);

      const row = document.createElement('tr');
      const propTd = document.createElement('td');
      propTd.textContent = l.propertyCode;
      const availTd = document.createElement('td');
      availTd.textContent = available.toFixed(DECIMALS);
      const priceTd = document.createElement('td');
      priceTd.textContent = priceStr;
      const tokenTd = document.createElement('td');
      const select = document.createElement('select');
      select.className = 'wp-block-select';
      paymentTokens.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.address;
        opt.textContent = t.symbol;
        select.appendChild(opt);
      });
      tokenTd.appendChild(select);
      const amtTd = document.createElement('td');
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'wp-block-input';
      input.min = '0';
      input.step = '0.01';
      amtTd.appendChild(input);
      const buyTd = document.createElement('td');
      const btnWrap = document.createElement('div');
      btnWrap.className = 'wp-block-buttons';
      const btnInner = document.createElement('div');
      btnInner.className = 'wp-block-button';
      const btn = document.createElement('button');
      btn.className = 'wp-block-button__link';
      btn.textContent = 'Buy';
      btnInner.appendChild(btn);
      btnWrap.appendChild(btnInner);
      buyTd.appendChild(btnWrap);
      row.appendChild(propTd);
      row.appendChild(availTd);
      row.appendChild(priceTd);
      row.appendChild(tokenTd);
      row.appendChild(amtTd);
      row.appendChild(buyTd);
      tbody.appendChild(row);

      btn.addEventListener('click', async () => {
        const amtVal = parseFloat(input.value);
        if (!amtVal || amtVal <= 0) return;
        try {
          const amount = toSQMUUnits(amtVal);
          const tokenAddr = select.value;
          const tokenMeta = paymentTokens.find((p) => p.address === tokenAddr);
          const usdTotalBn = await distributor.getPrice(l.propertyCode, amount);
          const usdAmount = fromStablecoinUnits(usdTotalBn, 2);
          const required = toStablecoinUnits(usdAmount, tokenMeta.decimals);
          await ensureAllowance(tokenAddr, required);
          const tx = await trade.buy(l.listingId, amount, tokenAddr);
          setTradeStatus('Buying tokens...');
          await tx.wait();
          setTradeStatus('Purchase complete', 'green');
          await displayListings();
          await displayBalances();
        } catch (err) {
          setTradeStatus(err.message, 'red');
        }
      });
    }
  } catch (err) {
    setTradeStatus(err.message, 'red');
  }
}

async function disconnect() {
  await disconnectWallet('portfolio-status');
  provider = undefined;
  signer = undefined;
  sqmu = undefined;
  distributor = undefined;
  trade = undefined;
  document.getElementById('disconnect').style.display = 'none';
  document.getElementById('connect').disabled = false;
}

document.getElementById('connect').addEventListener('click', connect);
document.getElementById('disconnect').addEventListener('click', disconnect);
