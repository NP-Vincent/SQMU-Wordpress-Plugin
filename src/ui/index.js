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

const shortenErrorMessage = (message, maxLength = 120) => {
  if (!message) return '';
  const firstLine = message.split('\n')[0].trim();
  if (firstLine.length <= maxLength) return firstLine;
  return `${firstLine.slice(0, maxLength - 3)}...`;
};

const formatErrorMessage = (error) => {
  const code =
    error?.code ?? error?.error?.code ?? error?.data?.code ?? null;
  if (code === 4001) {
    return 'User rejected the request.';
  }
  if (code === -32002) {
    return 'Request already pending in wallet.';
  }
  const message = shortenErrorMessage(
    typeof error === 'string' ? error : error?.message || 'Unknown error.'
  );
  return message || 'Unknown error.';
};

const renderActionError = (status, actionLabel, error) => {
  renderStatus(status, `${actionLabel} failed: ${formatErrorMessage(error)}`);
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

  const actionStatus = document.createElement('p');

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
    renderStatus(actionStatus, 'Connecting to MetaMask...');
    try {
      await state.connect();
      renderStatus(actionStatus, 'Connected.');
    } catch (error) {
      renderActionError(actionStatus, 'Connection', error);
    }
  });

  fetchPropertyButton.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Fetching property info...');
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
      renderStatus(actionStatus, 'Property loaded.');
    } catch (error) {
      renderActionError(actionStatus, 'Property lookup', error);
    }
  });

  refreshTokensButton.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Loading payment tokens...');
    try {
      const contract = contractForRead();
      const tokens = await contract.getPaymentTokens();
      updateTokensList(tokens);
      renderStatus(actionStatus, 'Payment tokens loaded.');
    } catch (error) {
      renderActionError(actionStatus, 'Token load', error);
    }
  });

  estimateButton.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Estimating price...');
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
      renderStatus(
        actionStatus,
        `Estimated total: ${formatted} ${symbol}`
      );
    } catch (error) {
      renderActionError(actionStatus, 'Estimate', error);
    }
  });

  approveButton.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Approving payment...');
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
      renderStatus(actionStatus, `Approval submitted: ${tx.hash}`);
      await tx.wait();
      renderStatus(actionStatus, 'Approval confirmed.');
    } catch (error) {
      renderActionError(actionStatus, 'Approval', error);
    }
  });

  buyButton.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Submitting purchase...');
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
      renderStatus(actionStatus, `Transaction submitted: ${tx.hash}`);
      await tx.wait();
      renderStatus(actionStatus, 'Purchase confirmed.');
    } catch (error) {
      renderActionError(actionStatus, 'Purchase', error);
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
  mount.appendChild(actionStatus);
}
