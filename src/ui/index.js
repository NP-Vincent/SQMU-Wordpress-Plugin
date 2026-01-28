import { formatUnits } from 'ethers';
import {
  createDistributorContract,
  createDistributorReadOnly,
  defaultDistributorAddress
} from '../contracts/atomicDistributor.js';
import { createErc20Contract } from '../contracts/erc20.js';

const USD_DECIMALS = 18n;
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
      tradeStatus: selectFromRoot(portfolioRoot, '#trade-status')
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

    const getContractAddress = () =>
      contractAddressInput?.value.trim() ||
      config.contractAddress ||
      defaultDistributorAddress ||
      '';

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

    const connectHandler = async () => {
      renderActionStatus('Connecting to MetaMask...');
      try {
        await state.connect();
        renderActionStatus('Connected.');
      } catch (error) {
        renderActionError('Connection', error);
      }
    };

    const disconnectHandler = async () => {
      renderActionStatus('Disconnecting wallet...');
      try {
        await state.disconnect?.();
        renderActionStatus('Disconnected.');
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
          const formatted = formatUnits(totalPrice, decimals);
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
          const spender = getContractAddress();
          const currentAllowance = await erc20.allowance(owner, spender);
          if (currentAllowance >= totalPrice) {
            renderActionStatus('Approval not needed. Allowance is sufficient.');
            return;
          }
          const tx = await erc20.approve(getContractAddress(), totalPrice);
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
