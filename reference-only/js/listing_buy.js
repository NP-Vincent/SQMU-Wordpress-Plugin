import { connectWallet, disconnectWallet } from './wallet.js';
import { DISTRIBUTOR_ADDRESS } from './config.js';
import { sendReceipt } from './email.js';
import { toSQMUUnits, fromSQMUUnits, fromStablecoinUnits } from './units.js';

const RPC = 'https://rpc.scroll.io';
const distributorAddress = DISTRIBUTOR_ADDRESS;
const DECIMALS = 2;

let provider;
let signer;
let distributor;

const erc20Abi = [
  'function decimals() view returns (uint8)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

function findPropertyCode() {
  let code = '';
  document.querySelectorAll('.es-entity-field').forEach((li) => {
    const label = li.querySelector('.es-property-field__label');
    const value = li.querySelector('.es-property-field__value');
    if (label && value && label.textContent.includes('SQMU Property Code')) {
      code = value.textContent.trim();
    }
  });
  if (!code) {
    const params = new URLSearchParams(location.search);
    code = params.get('code') || '';
  }
  return code;
}

async function fetchAvailable(code) {
  const rpcProvider = new ethers.providers.JsonRpcProvider(RPC);
  const dist = new ethers.Contract(
    distributorAddress,
    ['function getAvailable(string) view returns(uint256)'],
    rpcProvider
  );
  const bal = await dist.getAvailable(code);
  return Number(fromSQMUUnits(bal));
}

async function checkPropertyActive(propertyCode) {
  const info = await distributor.getPropertyInfo(propertyCode);
  if (info.tokenAddress === ethers.constants.AddressZero) {
    throw new Error('Property not found');
  }
  const active = await distributor.getPropertyStatus(propertyCode);
  if (!active) {
    throw new Error('Property not active for sale');
  }
  return info;
}

async function getRequiredAmount(propertyCode, sqmuAmount, paymentToken) {
  const prop = await checkPropertyActive(propertyCode);
  const erc20 = new ethers.Contract(paymentToken, erc20Abi, provider);
  const decimals = await erc20.decimals();
  const priceUSD = ethers.BigNumber.from(prop.priceUSD);
  return priceUSD
    .mul(ethers.BigNumber.from(sqmuAmount))
    .mul(ethers.BigNumber.from(10).pow(decimals))
    .div(ethers.constants.WeiPerEther);
}

async function ensureAllowance(tokenAddr, requiredAmount) {
  const erc20 = new ethers.Contract(tokenAddr, erc20Abi, signer);
  const owner = await signer.getAddress();
  const current = await erc20.allowance(owner, distributorAddress);
  if (current.gte(requiredAmount)) return;
  try {
    const tx = await erc20.approve(distributorAddress, requiredAmount);
    setStatus('Approving payment token...');
    await tx.wait();
  } catch (err) {
    setStatus(err.message, 'red');
    throw err;
  }
}

function setStatus(msg, color) {
  const el = document.getElementById('buy-status');
  el.innerHTML = color ? `<span style="color:${color};">${msg}</span>` : msg;
}

async function showAvailability() {
  const codeSpan = document.getElementById('property-code');
  const availSpan = document.getElementById('available-bal');
  const code = findPropertyCode();
  codeSpan.textContent = code || 'N/A';
  if (!code) {
    availSpan.textContent = 'N/A';
    document.getElementById('buy-btn').disabled = true;
    return;
  }
  try {
    const amt = await fetchAvailable(code);
    availSpan.textContent = amt.toLocaleString(undefined, {
      minimumFractionDigits: DECIMALS,
      maximumFractionDigits: DECIMALS,
    });
  } catch (err) {
    availSpan.textContent = 'N/A';
  }
}

async function connect() {
  try {
    ({ provider, signer } = await connectWallet('buy-status'));
    const abiUrl = new URL('../abi/AtomicSQMUDistributor.json', import.meta.url);
    const res = await fetch(abiUrl);
    const abiJson = await res.json();
    distributor = new ethers.Contract(distributorAddress, abiJson.abi, signer);
    document.getElementById('disconnect').style.display = '';
    document.getElementById('buy-btn').disabled = false;
    setStatus('Connected. Contract ready!', 'green');
  } catch (err) {
    setStatus(err.message, 'red');
  }
}

async function buyTokens() {
  if (!distributor) {
    setStatus('Connect wallet first.', 'red');
    return;
  }
  const propertyCode = findPropertyCode();
  const rawInput = document.getElementById('sqmu-amount').value;
  const amount = toSQMUUnits(rawInput);
  const tokenSelect = document.getElementById('token-select');
  const paymentToken = tokenSelect.value;
  const agentCode = document.getElementById('agent-code').value.trim();
  const email = document.getElementById('buyer-email').value.trim();

  try {
    const erc20 = new ethers.Contract(paymentToken, erc20Abi, provider);
    const decimals = await erc20.decimals();
    const required = await getRequiredAmount(propertyCode, amount, paymentToken);
    await ensureAllowance(paymentToken, required);
    const tx = await distributor.buySQMU(propertyCode, amount, paymentToken, agentCode);
    setStatus('Submitting transaction...');
    await tx.wait();
    setStatus(`Purchased ${Number(rawInput).toFixed(DECIMALS)} SQMU for ${propertyCode}`, 'green');
    await showAvailability();

    if (email) {
      const usd = fromStablecoinUnits(required, decimals);
      const tokenName = tokenSelect.options[tokenSelect.selectedIndex].text;
      sendReceipt('listing', {
        to_email: email,
        tx_link: `https://scrollscan.com/tx/${tx.hash}`,
        usd,
        token: tokenName,
        chain: 'Scroll',
        prop: propertyCode,
        sqmu_amt: Number(rawInput).toFixed(DECIMALS),
        agent: agentCode
      });
    }
  } catch (err) {
    setStatus(err.message, 'red');
  }
}

async function disconnect() {
  await disconnectWallet('buy-status');
  provider = undefined;
  signer = undefined;
  distributor = undefined;
  document.getElementById('disconnect').style.display = 'none';
  document.getElementById('buy-btn').disabled = true;
}

document.getElementById('connect').addEventListener('click', connect);
document.getElementById('disconnect').addEventListener('click', disconnect);
document.getElementById('buy-btn').addEventListener('click', buyTokens);
document.addEventListener('DOMContentLoaded', showAvailability);
