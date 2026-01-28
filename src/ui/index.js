import { formatUnits } from 'ethers';
import {
  createDistributorContract,
  createDistributorReadOnly,
  defaultDistributorAddress
} from '../contracts/atomicDistributor.js';
import { createErc20Contract } from '../contracts/erc20.js';

const USD_DECIMALS = 18n;
const SQMU_DECIMALS = 2n;

const createField = (labelText, input) => {
  const wrapper = document.createElement('label');
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.gap = '4px';
  wrapper.style.marginBottom = '12px';
  wrapper.textContent = labelText;
  wrapper.appendChild(input);
  return wrapper;
};

const renderStatus = (status, detail) => {
  status.textContent = detail;
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

export function mountUI(state, config = {}) {
  const mountSelector = config.mountSelector || '#metamask-dapp';
  const mount = document.querySelector(mountSelector);

  if (!mount) {
    return;
  }

  mount.innerHTML = '';
  mount.style.display = 'grid';
  mount.style.gap = '20px';
  mount.style.maxWidth = '560px';

  const heading = document.createElement('h2');
  heading.textContent = 'SQMU Distributor';

  const status = document.createElement('p');
  const accountLine = document.createElement('p');
  const chainLine = document.createElement('p');

  const connectButton = document.createElement('button');
  connectButton.type = 'button';
  connectButton.textContent = 'Connect MetaMask';

  const contractAddressInput = document.createElement('input');
  contractAddressInput.type = 'text';
  contractAddressInput.placeholder = '0x...';
  contractAddressInput.value =
    config.contractAddress || defaultDistributorAddress || '';

  const propertyCodeInput = document.createElement('input');
  propertyCodeInput.type = 'text';
  propertyCodeInput.placeholder = 'Property code';

  const fetchPropertyButton = document.createElement('button');
  fetchPropertyButton.type = 'button';
  fetchPropertyButton.textContent = 'Fetch property details';

  const propertyInfo = document.createElement('pre');
  propertyInfo.textContent = 'No property loaded.';
  propertyInfo.style.whiteSpace = 'pre-wrap';
  propertyInfo.style.margin = '0';

  const paymentTokenSelect = document.createElement('select');
  const refreshTokensButton = document.createElement('button');
  refreshTokensButton.type = 'button';
  refreshTokensButton.textContent = 'Load payment tokens';

  const sqmuAmountInput = document.createElement('input');
  sqmuAmountInput.type = 'number';
  sqmuAmountInput.min = '0.01';
  sqmuAmountInput.step = '0.01';

  const agentCodeInput = document.createElement('input');
  agentCodeInput.type = 'text';
  agentCodeInput.placeholder = 'Optional agent code';

  const estimateButton = document.createElement('button');
  estimateButton.type = 'button';
  estimateButton.textContent = 'Estimate total price';

  const approveButton = document.createElement('button');
  approveButton.type = 'button';
  approveButton.textContent = 'Approve payment';

  const buyButton = document.createElement('button');
  buyButton.type = 'button';
  buyButton.textContent = 'Buy SQMU';

  const actionStatusWrapper = document.createElement('div');
  actionStatusWrapper.style.display = 'flex';
  actionStatusWrapper.style.flexDirection = 'column';
  actionStatusWrapper.style.gap = '8px';

  const actionStatus = document.createElement('p');
  actionStatus.style.margin = '0';
  actionStatus.style.whiteSpace = 'pre-wrap';
  actionStatus.style.wordBreak = 'break-word';

  const copyErrorButton = document.createElement('button');
  copyErrorButton.type = 'button';
  copyErrorButton.textContent = 'Copy error';
  copyErrorButton.style.display = 'none';
  copyErrorButton.dataset.errorText = '';

  const resetCopyButtonLabel = () => {
    copyErrorButton.textContent = 'Copy error';
  };

  const copyErrorToClipboard = async () => {
    const errorText = copyErrorButton.dataset.errorText;
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

  copyErrorButton.addEventListener('click', copyErrorToClipboard);

  const renderActionStatus = (detail) => {
    renderStatus(actionStatus, detail);
    copyErrorButton.style.display = 'none';
    copyErrorButton.dataset.errorText = '';
    resetCopyButtonLabel();
  };

  const renderActionError = (actionLabel, error) => {
    const errorMessage = formatErrorMessage(error);
    const detail = `${actionLabel} failed:\n${errorMessage}`;
    renderStatus(actionStatus, detail);
    copyErrorButton.style.display = 'inline-flex';
    copyErrorButton.dataset.errorText = detail;
    resetCopyButtonLabel();
  };

  const getContractAddress = () =>
    contractAddressInput.value.trim() ||
    config.contractAddress ||
    defaultDistributorAddress ||
    '';

  const ensureConnected = () => {
    if (!state.signer) {
      throw new Error('Connect MetaMask first.');
    }
  };

  const updateConnectionStatus = () => {
    renderStatus(
      status,
      state.connected
        ? `Connected to ${shorten(state.account)}`
        : 'Wallet not connected.'
    );
    accountLine.textContent = `Account: ${state.account ?? 'N/A'}`;
    chainLine.textContent = `Chain ID: ${state.chainId ?? 'N/A'}`;
  };

  const contractForRead = () => {
    ensureConnected();
    return createDistributorReadOnly({
      provider: state.ethersProvider,
      address: getContractAddress()
    });
  };

  const contractForWrite = () => {
    ensureConnected();
    return createDistributorContract({
      signer: state.signer,
      address: getContractAddress()
    });
  };

  const updateTokensList = (tokens) => {
    paymentTokenSelect.innerHTML = '';
    if (!tokens.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No tokens available';
      paymentTokenSelect.appendChild(option);
      return;
    }
    tokens.forEach((token) => {
      const option = document.createElement('option');
      option.value = token;
      option.textContent = token;
      paymentTokenSelect.appendChild(option);
    });
  };

  connectButton.addEventListener('click', async () => {
    renderActionStatus('Connecting to MetaMask...');
    try {
      await state.connect();
      renderActionStatus('Connected.');
    } catch (error) {
      renderActionError('Connection', error);
    }
  });

  fetchPropertyButton.addEventListener('click', async () => {
    renderActionStatus('Fetching property info...');
    try {
      const propertyCode = propertyCodeInput.value.trim();
      if (!propertyCode) {
        throw new Error('Enter a property code.');
      }
      const contract = contractForRead();
      const [property, available, statusValue] = await Promise.all([
        contract.getPropertyInfo(propertyCode),
        contract.getAvailable(propertyCode),
        contract.getPropertyStatus(propertyCode)
      ]);
      propertyInfo.textContent = [
        `Name: ${property.name}`,
        `Token Address: ${property.tokenAddress}`,
        `Token ID: ${property.tokenId}`,
        `Treasury: ${property.treasury}`,
        `Price (USD, 18 decimals): ${property.priceUSD}`,
        `Active: ${statusValue ? 'Yes' : 'No'}`,
        `Available SQMU: ${available}`
      ].join('\n');
      renderActionStatus('Property loaded.');
    } catch (error) {
      renderActionError('Property lookup', error);
    }
  });

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

  estimateButton.addEventListener('click', async () => {
    renderActionStatus('Estimating price...');
    try {
      const propertyCode = propertyCodeInput.value.trim();
      const sqmuAmount = parseSqmuAmount(sqmuAmountInput.value);
      if (!propertyCode || sqmuAmount === null) {
        throw new Error('Enter property code and SQMU amount.');
      }
      const tokenAddress = paymentTokenSelect.value.trim();
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
      const formatted = formatUnits(totalPrice, decimals);
      renderActionStatus(`Estimated total: ${formatted} ${symbol}`);
    } catch (error) {
      renderActionError('Estimate', error);
    }
  });

  approveButton.addEventListener('click', async () => {
    renderActionStatus('Approving payment...');
    try {
      const propertyCode = propertyCodeInput.value.trim();
      const sqmuAmount = parseSqmuAmount(sqmuAmountInput.value);
      const tokenAddress = paymentTokenSelect.value.trim();
      if (!propertyCode || sqmuAmount === null || !tokenAddress) {
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
      const tx = await erc20.approve(getContractAddress(), totalPrice);
      renderActionStatus(`Approval submitted: ${tx.hash}`);
      await tx.wait();
      renderActionStatus('Approval confirmed.');
    } catch (error) {
      renderActionError('Approval', error);
    }
  });

  buyButton.addEventListener('click', async () => {
    renderActionStatus('Submitting purchase...');
    try {
      const propertyCode = propertyCodeInput.value.trim();
      const sqmuAmount = parseSqmuAmount(sqmuAmountInput.value);
      const tokenAddress = paymentTokenSelect.value.trim();
      if (!propertyCode || sqmuAmount === null || !tokenAddress) {
        throw new Error('Fill property, amount, and token.');
      }
      const agentCode = agentCodeInput.value.trim();
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

  updateConnectionStatus();
  state.subscribe(updateConnectionStatus);

  mount.appendChild(heading);
  mount.appendChild(status);
  mount.appendChild(accountLine);
  mount.appendChild(chainLine);
  mount.appendChild(connectButton);
  mount.appendChild(createField('Distributor contract address', contractAddressInput));
  mount.appendChild(createField('Property code', propertyCodeInput));
  mount.appendChild(fetchPropertyButton);
  mount.appendChild(propertyInfo);
  mount.appendChild(refreshTokensButton);
  mount.appendChild(createField('Payment token', paymentTokenSelect));
  mount.appendChild(createField('SQMU amount', sqmuAmountInput));
  mount.appendChild(createField('Agent code', agentCodeInput));
  mount.appendChild(estimateButton);
  mount.appendChild(approveButton);
  mount.appendChild(buyButton);
  actionStatusWrapper.appendChild(actionStatus);
  actionStatusWrapper.appendChild(copyErrorButton);
  mount.appendChild(actionStatusWrapper);
}
