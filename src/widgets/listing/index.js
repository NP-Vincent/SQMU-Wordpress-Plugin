import { JsonRpcProvider } from 'ethers';
import {
  createDistributorContract,
  createDistributorReadOnly,
  defaultDistributorAddress
} from '../../contracts/atomicDistributor.js';
import { createErc20Contract } from '../../contracts/erc20.js';
import { sendListingConfirmation } from '../../email.js';
import {
  renderButton,
  renderField,
  renderInput,
  renderSelect
} from '../../ui/index.js';
import {
  getPaymentToken,
  getPaymentTokensFromList
} from '../../utils/paymentTokens.js';
import { createWalletState } from '../../wallet/metamask.js';

const USD_DECIMALS = 18n;
const SQMU_DECIMALS = 2n;

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

const resolvePropertyCodeFromPage = () => {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return '';
  }

  const targetLabel = 'sqmu property code';
  const fields = document.querySelectorAll('.es-entity-field');
  for (const field of fields) {
    const label = field.querySelector('.es-entity-field__label, label');
    const labelText = label?.textContent?.trim().toLowerCase() ?? '';
    if (!labelText.includes(targetLabel)) {
      continue;
    }
    let valueElement = field.querySelector('.es-entity-field__value');
    if (!valueElement && label) {
      const siblings = Array.from(label.parentElement?.children ?? []).filter(
        (element) => element !== label
      );
      valueElement = siblings.find(
        (element) => element.textContent?.trim()
      );
    }
    if (!valueElement) {
      continue;
    }
    const value = valueElement.textContent?.trim() ?? '';
    if (value) {
      return value;
    }
  }

  const params = new URLSearchParams(window.location.search);
  return params.get('code')?.trim() ?? '';
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
  if (!resolvedConfig.propertyCode) {
    const derivedPropertyCode = resolvePropertyCodeFromPage();
    if (derivedPropertyCode) {
      resolvedConfig.propertyCode = derivedPropertyCode;
    }
  }

  mount.innerHTML = '';
  mount.classList.add('sqmu-widget');

  const grid = document.createElement('div');
  grid.className = 'sqmu-grid';

  const heading = document.createElement('h3');
  heading.textContent = 'SQMU Listing';

  const status = document.createElement('p');
  const accountLine = document.createElement('p');
  const chainLine = document.createElement('p');

  const connectButton = renderButton('Connect MetaMask', 'connect');
  const disconnectButton = renderButton('Disconnect wallet', 'disconnect');

  const contractAddressInput = renderInput({
    placeholder: '0x...',
    value: resolvedConfig.contractAddress
  });

  const propertyCodeInput = renderInput({
    placeholder: 'Property code',
    value: resolvedConfig.propertyCode
  });

  const loadPropertyButton = renderButton('Load property', 'load-property');

  const availableField = renderInput({
    readOnly: true,
    value: 'Not loaded'
  });

  const paymentTokenSelect = renderSelect();
  const refreshTokensButton = renderButton(
    'Load payment tokens',
    'load-tokens'
  );

  const sqmuAmountInput = renderInput({
    type: 'number',
    min: '0.01',
    step: '0.01'
  });

  const agentCodeInput = renderInput({
    placeholder: 'Optional agent code',
    value: resolvedConfig.agentCode
  });

  const emailInput = renderInput({
    type: 'email',
    placeholder: 'Optional email',
    value: resolvedConfig.email
  });

  const buyButton = renderButton('Buy SQMU', 'buy');

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
    const resolvedTokens = getPaymentTokensFromList(tokens);
    paymentTokenSelect.innerHTML = '';
    if (!resolvedTokens.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No tokens available';
      paymentTokenSelect.appendChild(option);
      return;
    }
    resolvedTokens.forEach((token) => {
      const option = document.createElement('option');
      option.value = token.address;
      option.textContent = token.symbol;
      paymentTokenSelect.appendChild(option);
    });
    if (resolvedConfig.tokenAddress) {
      paymentTokenSelect.value = resolvedConfig.tokenAddress;
    }
  };

  connectButton.button.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Connecting to MetaMask...');
    try {
      await state.connect();
      renderStatus(actionStatus, 'Connected.');
    } catch (error) {
      renderActionError(actionStatus, 'Connection', error);
    }
  });

  disconnectButton.button.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Disconnecting wallet...');
    try {
      await state.disconnect?.();
      renderStatus(actionStatus, 'Disconnected.');
    } catch (error) {
      renderActionError(actionStatus, 'Disconnect', error);
    }
  });

  loadPropertyButton.button.addEventListener('click', async () => {
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

  refreshTokensButton.button.addEventListener('click', async () => {
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

  buyButton.button.addEventListener('click', async () => {
    renderStatus(actionStatus, 'Submitting purchase...');
    try {
      const propertyCode = propertyCodeInput.value.trim();
      const sqmuAmount = parseSqmuAmount(sqmuAmountInput.value);
      const tokenAddress = paymentTokenSelect.value.trim();
      if (!propertyCode || sqmuAmount === null || !tokenAddress) {
        throw new Error('Fill property, amount, and token.');
      }
      const token = getPaymentToken(tokenAddress);
      if (!token) {
        throw new Error('Selected payment token is not supported.');
      }
      const contract = contractForWrite();
      const property = await contract.getPropertyInfo(propertyCode);
      const erc20 = createErc20Contract({
        signer: state.signer,
        address: token.address
      });
      const totalPrice = calculateTotalPrice(
        property.priceUSD,
        sqmuAmount,
        token.decimals
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
      const emailAddress = emailInput.value.trim();
      if (emailAddress) {
        sendListingConfirmation({
          email: emailAddress,
          propertyCode,
          propertyName: property.name || '',
          sqmuAmount: sqmuAmountInput.value.trim(),
          paymentToken: tokenAddress,
          totalPrice: totalPrice.toString(),
          tokenDecimals: token.decimals.toString(),
          agentCode: agentCodeInput.value.trim(),
          buyer: state.account ?? '',
          transactionHash: tx.hash
        });
        renderStatus(actionStatus, 'Purchase confirmed. Confirmation email queued.');
      } else {
        renderStatus(actionStatus, 'Purchase confirmed.');
      }
    } catch (error) {
      renderActionError(actionStatus, 'Purchase', error);
    }
  });

  updateConnectionStatus();
  state.subscribe(updateConnectionStatus);

  grid.appendChild(heading);
  grid.appendChild(status);
  grid.appendChild(accountLine);
  grid.appendChild(chainLine);
  grid.appendChild(connectButton.wrapper);
  grid.appendChild(disconnectButton.wrapper);
  grid.appendChild(renderField('Distributor contract address', contractAddressInput));
  grid.appendChild(renderField('Property code', propertyCodeInput));
  grid.appendChild(loadPropertyButton.wrapper);
  grid.appendChild(renderField('Available SQMU', availableField));
  grid.appendChild(refreshTokensButton.wrapper);
  grid.appendChild(renderField('Payment token', paymentTokenSelect));
  grid.appendChild(renderField('SQMU amount', sqmuAmountInput));
  grid.appendChild(renderField('Agent code', agentCodeInput));
  grid.appendChild(renderField('Email', emailInput));
  grid.appendChild(buyButton.wrapper);
  grid.appendChild(actionStatus);
  mount.appendChild(grid);

  return state;
}
