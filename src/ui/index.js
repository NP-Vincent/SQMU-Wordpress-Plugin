import { getEthers } from '../lib/ethers.js';
import {
  createDistributorContract,
  createDistributorReadOnly,
  defaultDistributorAddress
} from '../contracts/atomicDistributor.js';
import { createErc20Contract, createErc20ReadOnly } from '../contracts/erc20.js';
import {
  createSqmuContract,
  createSqmuReadOnly,
  defaultSqmuAddress
} from '../contracts/sqmu.js';
import {
  createTradeContract,
  createTradeReadOnly,
  defaultTradeAddress
} from '../contracts/trade.js';

const USD_DECIMALS = 18n;
const USD_PRICE_DECIMALS = 2;
const SQMU_DECIMALS = 2n;

const renderStatusTargets = (targets, detail) => {
  targets.forEach((target) => {
    if (target) {
      target.textContent = detail;
    }
  });
};

const stringifyError = (error) => {
  try {
    return JSON.stringify(error, null, 2);
  } catch (stringifyErrorValue) {
    return String(error ?? 'Unknown error.');
  }
};

const formatErrorMessage = (error) => {
  if (typeof error === 'string') {
    return error;
  }
  const message =
    error?.message || error?.data?.message || error?.error?.message;
  if (message) {
    return message;
  }
  const code =
    error?.code ?? error?.error?.code ?? error?.data?.code ?? null;
  if (code === 4001) {
    return 'User rejected the request.';
  }
  if (code === -32002) {
    return 'Request already pending in wallet.';
  }
  return stringifyError(error);
};

const formatUnits = (ethers, value, decimals) =>
  ethers.utils?.formatUnits
    ? ethers.utils.formatUnits(value, decimals)
    : ethers.formatUnits(value, decimals);

const parseUnits = (ethers, value, decimals) =>
  ethers.utils?.parseUnits
    ? ethers.utils.parseUnits(value, decimals)
    : ethers.parseUnits(value, decimals);

const toBigIntSafe = (ethers, value) => {
  if (typeof value === 'bigint') {
    return value;
  }
  if (ethers?.toBigInt) {
    return ethers.toBigInt(value);
  }
  return BigInt(value.toString());
};

const addValues = (ethers, left, right) => {
  if (ethers?.BigNumber?.isBigNumber?.(left) || ethers?.BigNumber?.isBigNumber?.(right)) {
    return ethers.BigNumber.from(left).add(ethers.BigNumber.from(right));
  }
  return toBigIntSafe(ethers, left) + toBigIntSafe(ethers, right);
};

const greaterThanOrEqual = (ethers, left, right) => {
  if (ethers?.BigNumber?.isBigNumber?.(left) || ethers?.BigNumber?.isBigNumber?.(right)) {
    return ethers.BigNumber.from(left).gte(ethers.BigNumber.from(right));
  }
  return toBigIntSafe(ethers, left) >= toBigIntSafe(ethers, right);
};

const shorten = (value) =>
  value ? `${value.slice(0, 6)}...${value.slice(-4)}` : 'Not connected';

const parseSqmuAmount = (value) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [wholePart, fractionPart = ''] = trimmed.split('.');
  if (fractionPart.length > Number(SQMU_DECIMALS)) return null;
  const paddedFraction = fractionPart.padEnd(Number(SQMU_DECIMALS), '0');
  const base = 10n ** SQMU_DECIMALS;
  return BigInt(wholePart) * base + BigInt(paddedFraction);
};

const calculateTotalPrice = (priceUSD, sqmuAmount, tokenDecimals) => {
  const decimals = 10n ** BigInt(tokenDecimals);
  return (priceUSD * sqmuAmount * decimals) / 10n ** USD_DECIMALS;
};

const formatUsdPrice = (ethers, value) => {
  const formatted = formatUnits(ethers, value, USD_PRICE_DECIMALS);
  const numeric = Number(formatted);
  if (Number.isFinite(numeric)) {
    return `USD ${numeric.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }
  return `USD ${formatted}`;
};

const formatSqmuAmount = (ethers, value) =>
  formatUnits(ethers, value, Number(SQMU_DECIMALS));

const convertUsdPriceToTokenUnits = (ethers, usdValue, tokenDecimals) => {
  const decimalDelta = BigInt(tokenDecimals - USD_PRICE_DECIMALS);
  if (ethers?.BigNumber?.from) {
    const usdBase = ethers.BigNumber.from(usdValue);
    const factor = ethers.BigNumber.from(10).pow(
      Math.abs(Number(decimalDelta))
    );
    return decimalDelta >= 0n ? usdBase.mul(factor) : usdBase.div(factor);
  }
  const usdBase = toBigIntSafe(ethers, usdValue);
  const factor = 10n ** BigInt(Math.abs(Number(decimalDelta)));
  return decimalDelta >= 0n ? usdBase * factor : usdBase / factor;
};

const selectFromRoot = (root, selector) => (root ? root.querySelector(selector) : null);

const toggleHidden = (element, shouldHide) => {
  if (!element) return;
  element.classList.toggle('sqmu-hidden', shouldHide);
};

const setDisabled = (element, disabled) => {
  if (!element) return;
  element.disabled = Boolean(disabled);
};

export function mountUI(state, config = {}) {
    const setup = () => {
      const ethers = getEthers();
    const scopedRoot = config.mountSelector
      ? document.querySelector(config.mountSelector)
      : null;
    const queryRoot = scopedRoot || document;
    const listingRoot =
      selectFromRoot(queryRoot, '.sqmu-listing-buy') ||
      selectFromRoot(document, '.sqmu-listing-buy');
    const portfolioRoot =
      selectFromRoot(queryRoot, '.sqmu-portfolio') ||
      selectFromRoot(document, '.sqmu-portfolio');

    if (!listingRoot && !portfolioRoot) {
      return;
    }

    const listing = {
      propertyCode: selectFromRoot(listingRoot, '#property-code'),
      availableBalance: selectFromRoot(listingRoot, '#available-bal'),
      connectButton: selectFromRoot(listingRoot, '#connect'),
      disconnectButton: selectFromRoot(listingRoot, '#disconnect'),
      sqmuAmountInput: selectFromRoot(listingRoot, '#sqmu-amount'),
      paymentTokenSelect: selectFromRoot(listingRoot, '#token-select'),
      agentCodeInput: selectFromRoot(listingRoot, '#agent-code'),
      buyerEmailInput: selectFromRoot(listingRoot, '#buyer-email'),
      buyButton: selectFromRoot(listingRoot, '#buy-btn'),
      actionStatus: selectFromRoot(listingRoot, '#buy-status')
    };

    const portfolio = {
      connectButton: selectFromRoot(portfolioRoot, '#connect'),
      disconnectButton: selectFromRoot(portfolioRoot, '#disconnect'),
      status: selectFromRoot(portfolioRoot, '#portfolio-status'),
      tradeStatus: selectFromRoot(portfolioRoot, '#trade-status'),
      portfolioTableBody: selectFromRoot(portfolioRoot, '#portfolio-table tbody'),
      listingTableBody: selectFromRoot(portfolioRoot, '#listing-table tbody'),
      totalSqmu: selectFromRoot(portfolioRoot, '#total-sqmu'),
      totalUsd: selectFromRoot(portfolioRoot, '#total-usd')
    };

    const contractAddressInput =
      selectFromRoot(listingRoot, '#contract-address') ||
      selectFromRoot(portfolioRoot, '#contract-address');
    const propertyCodeInput =
      selectFromRoot(listingRoot, '#property-code-input') ||
      selectFromRoot(portfolioRoot, '#property-code-input');
    const fetchPropertyButton =
      selectFromRoot(listingRoot, '#fetch-property') ||
      selectFromRoot(portfolioRoot, '#fetch-property');
    const propertyInfo =
      selectFromRoot(listingRoot, '#property-info') ||
      selectFromRoot(portfolioRoot, '#property-info');
    const refreshTokensButton =
      selectFromRoot(listingRoot, '#refresh-tokens') ||
      selectFromRoot(portfolioRoot, '#refresh-tokens');
    const estimateButton =
      selectFromRoot(listingRoot, '#estimate-total') ||
      selectFromRoot(portfolioRoot, '#estimate-total');
    const approveButton =
      selectFromRoot(listingRoot, '#approve-payment') ||
      selectFromRoot(portfolioRoot, '#approve-payment');
    const copyErrorButton =
      selectFromRoot(listingRoot, '#copy-error') ||
      selectFromRoot(portfolioRoot, '#copy-error');

    const actionStatusTargets = [listing.actionStatus, portfolio.tradeStatus].filter(
      Boolean
    );
    const connectionStatusTargets = [portfolio.status, listing.actionStatus].filter(
      Boolean
    );

    const renderActionStatus = (detail) => {
      renderStatusTargets(actionStatusTargets, detail);
      if (copyErrorButton) {
        toggleHidden(copyErrorButton, true);
        copyErrorButton.dataset.errorText = '';
        copyErrorButton.textContent = 'Copy error';
      }
    };

    const renderActionError = (actionLabel, error) => {
      const errorMessage = formatErrorMessage(error);
      const detail = `${actionLabel} failed:\n${errorMessage}`;
      renderStatusTargets(actionStatusTargets, detail);
      if (copyErrorButton) {
        toggleHidden(copyErrorButton, false);
        copyErrorButton.dataset.errorText = detail;
        copyErrorButton.textContent = 'Copy error';
      }
    };

    const resetCopyButtonLabel = () => {
      if (copyErrorButton) {
        copyErrorButton.textContent = 'Copy error';
      }
    };

    const copyErrorToClipboard = async () => {
      const errorText = copyErrorButton?.dataset.errorText;
      if (!errorText) {
        return;
      }
      const previousLabel = copyErrorButton.textContent;
      try {
        await navigator.clipboard.writeText(errorText);
        copyErrorButton.textContent = 'Copied!';
      } catch (copyError) {
        const textarea = document.createElement('textarea');
        textarea.value = errorText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        copyErrorButton.textContent = 'Copied!';
      }
      setTimeout(() => {
        copyErrorButton.textContent = previousLabel;
      }, 1500);
    };

    if (copyErrorButton) {
      copyErrorButton.addEventListener('click', copyErrorToClipboard);
    }

    const getDistributorAddress = () =>
      contractAddressInput?.value.trim() ||
      config.distributorAddress ||
      config.contractAddress ||
      defaultDistributorAddress ||
      '';

    const getSqmuAddress = () =>
      config.sqmuAddress || defaultSqmuAddress || '';

    const getTradeAddress = () =>
      config.tradeAddress || defaultTradeAddress || '';

    const getPropertyCode = () => {
      if (propertyCodeInput) {
        return propertyCodeInput.value.trim();
      }
      if (listing.propertyCode) {
        return listing.propertyCode.textContent.trim();
      }
      return '';
    };

    const updateAvailableBalance = (value) => {
      if (listing.availableBalance) {
        listing.availableBalance.textContent = value;
      }
    };

    const ensureConnected = () => {
      if (!state.signer) {
        throw new Error('Connect MetaMask first.');
      }
    };

    const updateConnectionStatus = () => {
      renderStatusTargets(
        connectionStatusTargets,
        state.connected
          ? `Connected to ${shorten(state.account)}`
          : 'Wallet not connected.'
      );
      toggleHidden(listing.connectButton, state.connected);
      toggleHidden(listing.disconnectButton, !state.connected);
      toggleHidden(portfolio.connectButton, state.connected);
      toggleHidden(portfolio.disconnectButton, !state.connected);
      setDisabled(listing.buyButton, !state.connected);
    };

    const contractForRead = () => {
      ensureConnected();
      return createDistributorReadOnly({
        provider: state.ethersProvider,
        address: getDistributorAddress()
      });
    };

    const contractForWrite = () => {
      ensureConnected();
      return createDistributorContract({
        signer: state.signer,
        address: getDistributorAddress()
      });
    };

    const maxTokenId = Number(config.maxTokenId ?? 100);
    let paymentTokens = [];

    const updateTokensList = (tokens) => {
      if (!listing.paymentTokenSelect) {
        return;
      }
      listing.paymentTokenSelect.innerHTML = '';
      if (!tokens.length) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No tokens available';
        listing.paymentTokenSelect.appendChild(option);
        return;
      }
      tokens.forEach((token) => {
        const option = document.createElement('option');
        option.value = token;
        option.textContent = token;
        listing.paymentTokenSelect.appendChild(option);
      });
    };

    const sqmuForRead = () => {
      ensureConnected();
      return createSqmuReadOnly({
        provider: state.ethersProvider,
        address: getSqmuAddress()
      });
    };

    const sqmuForWrite = () => {
      ensureConnected();
      return createSqmuContract({
        signer: state.signer,
        address: getSqmuAddress()
      });
    };

    const tradeForRead = () => {
      ensureConnected();
      return createTradeReadOnly({
        provider: state.ethersProvider,
        address: getTradeAddress()
      });
    };

    const tradeForWrite = () => {
      ensureConnected();
      return createTradeContract({
        signer: state.signer,
        address: getTradeAddress()
      });
    };

    const loadPaymentTokens = async () => {
      const contract = contractForRead();
      const tokenAddresses = await contract.getPaymentTokens();
      paymentTokens = await Promise.all(
        tokenAddresses.map(async (address) => {
          const erc20 = createErc20ReadOnly({
            provider: state.ethersProvider,
            address
          });
          let symbol = address;
          let decimals = 18;
          try {
            [symbol, decimals] = await Promise.all([
              erc20.symbol(),
              erc20.decimals()
            ]);
          } catch (error) {
            symbol = address;
            decimals = 18;
          }
          return { address, symbol, decimals };
        })
      );
      return paymentTokens;
    };

    const renderPortfolioStatus = (detail) => {
      renderStatusTargets([portfolio.status].filter(Boolean), detail);
    };

    const renderTradeStatus = (detail) => {
      renderStatusTargets([portfolio.tradeStatus].filter(Boolean), detail);
    };

    const ensureTokenAllowance = async (tokenAddress, requiredAmount) => {
      const owner = state.account;
      const erc20 = createErc20Contract({
        signer: state.signer,
        address: tokenAddress
      });
      const current = await erc20.allowance(owner, getTradeAddress());
      if (greaterThanOrEqual(ethers, current, requiredAmount)) {
        return;
      }
      const tx = await erc20.approve(getTradeAddress(), requiredAmount);
      renderTradeStatus('Approving payment token...');
      await tx.wait();
    };

    const renderPortfolioTables = async () => {
      if (!portfolio.portfolioTableBody) {
        return;
      }
      const sqmuContract = sqmuForRead();
      const distributor = contractForRead();
      const owner = state.account;
      const ids = [];
      const owners = [];
      for (let i = 1; i <= maxTokenId; i += 1) {
        ids.push(i);
        owners.push(owner);
      }
      const balances = await sqmuContract.balanceOfBatch(owners, ids);
      portfolio.portfolioTableBody.innerHTML = '';
      let totalSqmu = 0;
      let totalUsd = ethers.BigNumber?.from
        ? ethers.BigNumber.from(0)
        : 0n;
      for (let i = 0; i < ids.length; i += 1) {
        const balance = balances[i];
        const amountString = formatSqmuAmount(ethers, balance);
        const amountNumber = Number(amountString);
        if (!amountNumber) {
          continue;
        }
        let price;
        try {
          price = await distributor.getPrice(`SQMU${ids[i]}`, balance);
        } catch (error) {
          continue;
        }
        totalSqmu += amountNumber;
        totalUsd = addValues(ethers, totalUsd, price);
        const row = document.createElement('tr');
        const propertyCell = document.createElement('td');
        propertyCell.textContent = `SQMU${ids[i]}`;
        const balanceCell = document.createElement('td');
        balanceCell.textContent = amountNumber.toFixed(Number(SQMU_DECIMALS));
        const valueCell = document.createElement('td');
        valueCell.textContent = formatUsdPrice(ethers, price);
        const amountCell = document.createElement('td');
        const amountInput = document.createElement('input');
        amountInput.type = 'number';
        amountInput.className = 'wp-block-input';
        amountInput.min = '0';
        amountInput.step = '0.01';
        amountCell.appendChild(amountInput);
        const sellCell = document.createElement('td');
        const buttonWrap = document.createElement('div');
        buttonWrap.className = 'wp-block-buttons';
        const buttonInner = document.createElement('div');
        buttonInner.className = 'wp-block-button';
        const sellButton = document.createElement('button');
        sellButton.className = 'wp-block-button__link';
        sellButton.textContent = 'Sell';
        buttonInner.appendChild(sellButton);
        buttonWrap.appendChild(buttonInner);
        sellCell.appendChild(buttonWrap);
        row.appendChild(propertyCell);
        row.appendChild(balanceCell);
        row.appendChild(valueCell);
        row.appendChild(amountCell);
        row.appendChild(sellCell);
        portfolio.portfolioTableBody.appendChild(row);

        sellButton.addEventListener('click', async () => {
          const rawValue = amountInput.value.trim();
          if (!rawValue) {
            return;
          }
          try {
            const amount = parseUnits(ethers, rawValue, Number(SQMU_DECIMALS));
            const sqmuContractWrite = sqmuForWrite();
            const tradeContract = tradeForWrite();
            const approved = await sqmuContractWrite.isApprovedForAll(
              state.account,
              getTradeAddress()
            );
            if (!approved) {
              renderTradeStatus('Approving SQMU transfer...');
              const approvalTx = await sqmuContractWrite.setApprovalForAll(
                getTradeAddress(),
                true
              );
              await approvalTx.wait();
            }
            const tx = await tradeContract.listToken(
              `SQMU${ids[i]}`,
              getSqmuAddress(),
              ids[i],
              amount
            );
            renderTradeStatus('Listing tokens...');
            await tx.wait();
            renderTradeStatus('Listing created.');
            await renderPortfolioTables();
            await renderListingsTable();
          } catch (error) {
            renderTradeStatus(formatErrorMessage(error));
          }
        });
      }
      if (portfolio.totalSqmu) {
        portfolio.totalSqmu.textContent = totalSqmu.toFixed(Number(SQMU_DECIMALS));
      }
      if (portfolio.totalUsd) {
        portfolio.totalUsd.textContent = formatUsdPrice(ethers, totalUsd);
      }
      renderPortfolioStatus('Balances loaded.');
    };

    const renderListingsTable = async () => {
      if (!portfolio.listingTableBody) {
        return;
      }
      const tradeContract = tradeForRead();
      const distributor = contractForRead();
      portfolio.listingTableBody.innerHTML = '';
      try {
        const listings = await tradeContract.getActiveListings();
        const tokens = paymentTokens.length ? paymentTokens : await loadPaymentTokens();
        for (const listing of listings) {
          if (Number(listing.tokenId) === 0) {
            continue;
          }
          const available = formatSqmuAmount(ethers, listing.amountListed);
          const price = await distributor.getPrice(
            listing.propertyCode,
            parseUnits(ethers, '1', Number(SQMU_DECIMALS))
          );
          const row = document.createElement('tr');
          const propertyCell = document.createElement('td');
          propertyCell.textContent = listing.propertyCode;
          const availableCell = document.createElement('td');
          availableCell.textContent = Number(available).toFixed(Number(SQMU_DECIMALS));
          const priceCell = document.createElement('td');
          priceCell.textContent = formatUsdPrice(ethers, price);
          const tokenCell = document.createElement('td');
          const tokenSelect = document.createElement('select');
          tokenSelect.className = 'wp-block-select';
          tokens.forEach((token) => {
            const option = document.createElement('option');
            option.value = token.address;
            option.textContent = token.symbol;
            tokenSelect.appendChild(option);
          });
          tokenCell.appendChild(tokenSelect);
          const amountCell = document.createElement('td');
          const amountInput = document.createElement('input');
          amountInput.type = 'number';
          amountInput.className = 'wp-block-input';
          amountInput.min = '0';
          amountInput.step = '0.01';
          amountCell.appendChild(amountInput);
          const buyCell = document.createElement('td');
          const buttonWrap = document.createElement('div');
          buttonWrap.className = 'wp-block-buttons';
          const buttonInner = document.createElement('div');
          buttonInner.className = 'wp-block-button';
          const buyButton = document.createElement('button');
          buyButton.className = 'wp-block-button__link';
          buyButton.textContent = 'Buy';
          buttonInner.appendChild(buyButton);
          buttonWrap.appendChild(buttonInner);
          buyCell.appendChild(buttonWrap);
          row.appendChild(propertyCell);
          row.appendChild(availableCell);
          row.appendChild(priceCell);
          row.appendChild(tokenCell);
          row.appendChild(amountCell);
          row.appendChild(buyCell);
          portfolio.listingTableBody.appendChild(row);

          buyButton.addEventListener('click', async () => {
            const rawValue = amountInput.value.trim();
            if (!rawValue) {
              return;
            }
            try {
              const amount = parseUnits(ethers, rawValue, Number(SQMU_DECIMALS));
              const tokenAddress = tokenSelect.value;
              const tokenMeta = tokens.find((token) => token.address === tokenAddress);
              const priceTotal = await distributor.getPrice(
                listing.propertyCode,
                amount
              );
              const required = convertUsdPriceToTokenUnits(
                ethers,
                priceTotal,
                tokenMeta?.decimals ?? 18
              );
              await ensureTokenAllowance(tokenAddress, required);
              const tx = await tradeForWrite().buy(
                listing.listingId,
                amount,
                tokenAddress
              );
              renderTradeStatus('Buying tokens...');
              await tx.wait();
              renderTradeStatus('Purchase complete.');
              await renderListingsTable();
              await renderPortfolioTables();
            } catch (error) {
              renderTradeStatus(formatErrorMessage(error));
            }
          });
        }
      } catch (error) {
        renderTradeStatus(formatErrorMessage(error));
      }
    };

    const connectHandler = async () => {
      renderActionStatus('Connecting to MetaMask...');
      try {
        await state.connect();
        renderActionStatus('Connected.');
        if (portfolioRoot) {
          renderPortfolioStatus('Connected. Loading portfolio...');
          try {
            await loadPaymentTokens();
            await renderPortfolioTables();
            await renderListingsTable();
          } catch (error) {
            renderPortfolioStatus(formatErrorMessage(error));
          }
        }
      } catch (error) {
        renderActionError('Connection', error);
      }
    };

    const disconnectHandler = async () => {
      renderActionStatus('Disconnecting wallet...');
      try {
        await state.disconnect?.();
        renderActionStatus('Disconnected.');
        if (portfolioRoot) {
          renderPortfolioStatus('Wallet not connected.');
          renderTradeStatus('');
          if (portfolio.portfolioTableBody) {
            portfolio.portfolioTableBody.innerHTML = '';
          }
          if (portfolio.listingTableBody) {
            portfolio.listingTableBody.innerHTML = '';
          }
          if (portfolio.totalSqmu) {
            portfolio.totalSqmu.textContent = '';
          }
          if (portfolio.totalUsd) {
            portfolio.totalUsd.textContent = '';
          }
        }
      } catch (error) {
        renderActionError('Disconnect', error);
      }
    };

    [listing.connectButton, portfolio.connectButton]
      .filter(Boolean)
      .forEach((button) => {
        button.addEventListener('click', connectHandler);
      });

    [listing.disconnectButton, portfolio.disconnectButton]
      .filter(Boolean)
      .forEach((button) => {
        button.addEventListener('click', disconnectHandler);
      });

    if (fetchPropertyButton) {
      fetchPropertyButton.addEventListener('click', async () => {
        renderActionStatus('Fetching property info...');
        try {
          const propertyCode = getPropertyCode();
          if (!propertyCode) {
            throw new Error('Enter a property code.');
          }
          const contract = contractForRead();
          const [property, available, statusValue] = await Promise.all([
            contract.getPropertyInfo(propertyCode),
            contract.getAvailable(propertyCode),
            contract.getPropertyStatus(propertyCode)
          ]);
          if (propertyInfo) {
            propertyInfo.textContent = [
              `Name: ${property.name}`,
              `Token Address: ${property.tokenAddress}`,
              `Token ID: ${property.tokenId}`,
              `Treasury: ${property.treasury}`,
              `Price (USD, 18 decimals): ${property.priceUSD}`,
              `Active: ${statusValue ? 'Yes' : 'No'}`,
              `Available SQMU: ${available}`
            ].join('\n');
          }
          updateAvailableBalance(String(available));
          renderActionStatus('Property loaded.');
        } catch (error) {
          renderActionError('Property lookup', error);
        }
      });
    }

    if (refreshTokensButton) {
      refreshTokensButton.addEventListener('click', async () => {
        renderActionStatus('Loading payment tokens...');
        try {
          const contract = contractForRead();
          const tokens = await contract.getPaymentTokens();
          updateTokensList(tokens);
          renderActionStatus('Payment tokens loaded.');
        } catch (error) {
          renderActionError('Token load', error);
        }
      });
    }

    if (estimateButton) {
      estimateButton.addEventListener('click', async () => {
        renderActionStatus('Estimating price...');
        try {
          const propertyCode = getPropertyCode();
          const sqmuAmount = parseSqmuAmount(
            listing.sqmuAmountInput?.value ?? ''
          );
          if (!propertyCode || sqmuAmount === null) {
            throw new Error('Enter property code and SQMU amount.');
          }
          const tokenAddress = listing.paymentTokenSelect?.value.trim() ?? '';
          if (!tokenAddress) {
            throw new Error('Select a payment token.');
          }
          const contract = contractForRead();
          const property = await contract.getPropertyInfo(propertyCode);
          const erc20 = createErc20Contract({
            signer: state.signer,
            address: tokenAddress
          });
          const [decimals, symbol] = await Promise.all([
            erc20.decimals(),
            erc20.symbol()
          ]);
          const totalPrice = calculateTotalPrice(
            property.priceUSD,
            sqmuAmount,
            decimals
          );
          const formatted = ethers.utils.formatUnits(totalPrice, decimals);
          renderActionStatus(`Estimated total: ${formatted} ${symbol}`);
        } catch (error) {
          renderActionError('Estimate', error);
        }
      });
    }

    if (approveButton) {
      approveButton.addEventListener('click', async () => {
        renderActionStatus('Approving payment...');
        try {
          const owner = state.account;
          const propertyCode = getPropertyCode();
          const sqmuAmount = parseSqmuAmount(
            listing.sqmuAmountInput?.value ?? ''
          );
          const tokenAddress = listing.paymentTokenSelect?.value.trim() ?? '';
          if (!owner || !propertyCode || sqmuAmount === null || !tokenAddress) {
            throw new Error('Fill property, amount, and token.');
          }
          const contract = contractForRead();
          const property = await contract.getPropertyInfo(propertyCode);
          const erc20 = createErc20Contract({
            signer: state.signer,
            address: tokenAddress
          });
          const decimals = await erc20.decimals();
          const totalPrice = calculateTotalPrice(
            property.priceUSD,
            sqmuAmount,
            decimals
          );
          const spender = getDistributorAddress();
          const currentAllowance = await erc20.allowance(owner, spender);
          if (currentAllowance >= totalPrice) {
            renderActionStatus('Approval not needed. Allowance is sufficient.');
            return;
          }
          const tx = await erc20.approve(getDistributorAddress(), totalPrice);
          renderActionStatus(`Approval submitted: ${tx.hash}`);
          await tx.wait();
          renderActionStatus('Approval confirmed.');
        } catch (error) {
          renderActionError('Approval', error);
        }
      });
    }

    if (listing.buyButton) {
      listing.buyButton.addEventListener('click', async () => {
        renderActionStatus('Submitting purchase...');
        try {
          const propertyCode = getPropertyCode();
          const sqmuAmount = parseSqmuAmount(
            listing.sqmuAmountInput?.value ?? ''
          );
          const tokenAddress = listing.paymentTokenSelect?.value.trim() ?? '';
          if (!propertyCode || sqmuAmount === null || !tokenAddress) {
            throw new Error('Fill property, amount, and token.');
          }
          const agentCode = listing.agentCodeInput?.value.trim() ?? '';
          const contract = contractForWrite();
          const tx = await contract.buySQMU(
            propertyCode,
            sqmuAmount,
            tokenAddress,
            agentCode
          );
          renderActionStatus(`Transaction submitted: ${tx.hash}`);
          await tx.wait();
          renderActionStatus('Purchase confirmed.');
        } catch (error) {
          renderActionError('Purchase', error);
        }
      });
    }

    updateConnectionStatus();
    state.subscribe(updateConnectionStatus);
  };

  if (typeof document === 'undefined') {
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
}
