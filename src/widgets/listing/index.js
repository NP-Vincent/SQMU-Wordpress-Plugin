import { JsonRpcProvider } from 'ethers';
import {
  createDistributorContract,
  createDistributorReadOnly,
  defaultDistributorAddress
} from '../../contracts/atomicDistributor.js';
import { createErc20Contract } from '../../contracts/erc20.js';
import { createWalletState } from '../../wallet/metamask.js';

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

const normalizeChainId = (chainId) => {
  if (typeof chainId === 'string' && chainId.trim() !== '') {
    return chainId.startsWith('0x')
      ? Number.parseInt(chainId, 16)
      : Number.parseInt(chainId, 10);
  }
  if (typeof chainId === 'number') {
    return chainId;
  }
  return null;
};

const enforceChain = (state, config) => {
  const expected = normalizeChainId(config.chainId);
  if (expected && state.chainId && expected !== state.chainId) {
    throw new Error(`Switch to chain ${expected} before proceeding.`);
  }
};

const getReadProvider = (state, config) => {
  if (config.rpcUrl) {
    return new JsonRpcProvider(config.rpcUrl);
  }
  if (state.ethersProvider) {
    return state.ethersProvider;
  }
  throw new Error('Connect wallet or supply an RPC URL for read-only calls.');
};

export function initListingWidget(mount, config = {}) {
  if (!mount) {
    return null;
  }

  const state = createWalletState(config);
  const resolvedConfig = {
    contractAddress: config.contractAddress || defaultDistributorAddress || '',
    propertyCode: config.propertyCode || '',
    tokenAddress: config.tokenAddress || '',
    agentCode: config.agentCode || '',
    email: config.email || ''
  };

  mount.innerHTML = '';
  mount.style.display = 'grid';
  mount.style.gap = '16px';
  mount.style.maxWidth = '560px';

  const heading = document.createElement('h3');
  heading.textContent = 'SQMU Listing';

  const status = document.createElement('p');
  const accountLine = document.createElement('p');
  const chainLine = document.createElement('p');

  const connectButton = document.createElement('button');
  connectButton.type = 'button';
  connectButton.textContent = 'Connect MetaMask';

  const disconnectButton = document.createElement('button');
  disconnectButton.type = 'button';
  disconnectButton.textContent = 'Disconnect wallet';

  const contractAddressInput = document.createElement('input');
  contractAddressInput.type = 'text';
  contractAddressInput.placeholder = '0x...';
  contractAddressInput.value = resolvedConfig.contractAddress;

  const propertyCodeInput = document.createElement('input');
  propertyCodeInput.type = 'text';
  propertyCodeInput.placeholder = 'Property code';
  propertyCodeInput.value = resolvedConfig.propertyCode;

  const loadPropertyButton = document.createElement('button');
  loadPropertyButton.type = 'button';
  loadPropertyButton.textContent = 'Load property';

  const availableField = document.createElement('input');
  availableField.type = 'text';
  availableField.readOnly = true;
  availableField.value = 'Not loaded';

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
  agentCodeInput.value = resolvedConfig.agentCode;

  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.placeholder = 'Optional email';
  emailInput.value = resolvedConfig.email;

  const buyButton = document.createElement('button');
  buyButton.type = 'button';
  buyButton.textContent = 'Buy SQMU';

  const actionStatus = document.createElement('p');

  const getContractAddress = () =>
    contractAddressInput.value.trim() ||
    resolvedConfig.contractAddress ||
    defaultDistributorAddress ||
    '';

  const updateConnectionStatus = () => {
    renderStatus(
      status,
      state.connected
        ? `Connected to ${state.account ?? ''}`
        : 'Wallet not connected.'
    );
    accountLine.textContent = `Account: ${state.account ?? 'N/A'}`;
    chainLine.textContent = `Chain ID: ${state.chainId ?? 'N/A'}`;
  };

  const contractForRead = () => {
    const provider = getReadProvider(state, config);
    return createDistributorReadOnly({
      provider,
      address: getContractAddress()
    });
  };

  const contractForWrite = () => {
    if (!state.signer) {
      throw new Error('Connect MetaMask first.');
    }
    enforceChain(state, config);
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
    if (resolvedConfig.tokenAddress) {
      paymentTokenSelect.value = resolvedConfig.tokenAddress;
    }
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

  disconnectButton.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Disconnecting wallet...');
    try {
      await state.disconnect?.();
      renderStatus(actionStatus, 'Disconnected.');
    } catch (error) {
      renderActionError(actionStatus, 'Disconnect', error);
    }
  });

  loadPropertyButton.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Loading property...');
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
      availableField.value = `${available} (Active: ${statusValue ? 'Yes' : 'No'})`;
      resolvedConfig.propertyCode = propertyCode;
      renderStatus(
        actionStatus,
        `Loaded ${property.name || propertyCode}.`
      );
    } catch (error) {
      renderActionError(actionStatus, 'Property load', error);
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

  buyButton.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Submitting purchase...');
    try {
      const propertyCode = propertyCodeInput.value.trim();
      const sqmuAmount = parseSqmuAmount(sqmuAmountInput.value);
      const tokenAddress = paymentTokenSelect.value.trim();
      if (!propertyCode || sqmuAmount === null || !tokenAddress) {
        throw new Error('Fill property, amount, and token.');
      }
      const contract = contractForWrite();
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
      const allowance = await erc20.allowance(
        state.account,
        getContractAddress()
      );
      if (allowance < totalPrice) {
        const approveTx = await erc20.approve(
          getContractAddress(),
          totalPrice
        );
        renderStatus(actionStatus, `Approval submitted: ${approveTx.hash}`);
        await approveTx.wait();
      }
      const tx = await contract.buySQMU(
        propertyCode,
        sqmuAmount,
        tokenAddress,
        agentCodeInput.value.trim()
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
  mount.appendChild(disconnectButton);
  mount.appendChild(createField('Distributor contract address', contractAddressInput));
  mount.appendChild(createField('Property code', propertyCodeInput));
  mount.appendChild(loadPropertyButton);
  mount.appendChild(createField('Available SQMU', availableField));
  mount.appendChild(refreshTokensButton);
  mount.appendChild(createField('Payment token', paymentTokenSelect));
  mount.appendChild(createField('SQMU amount', sqmuAmountInput));
  mount.appendChild(createField('Agent code', agentCodeInput));
  mount.appendChild(createField('Email', emailInput));
  mount.appendChild(buyButton);
  mount.appendChild(actionStatus);

  return state;
}
