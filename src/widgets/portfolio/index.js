import { JsonRpcProvider } from 'ethers';
import {
  createDistributorReadOnly,
  defaultDistributorAddress
} from '../../contracts/atomicDistributor.js';
import {
  renderButton,
  renderField,
  renderInput,
  renderSelect
} from '../../ui/index.js';
import {
  formatUsd,
  fromSQMUUnits,
  toSQMUUnits
} from '../../utils/units.js';
import { createWalletState } from '../../wallet/metamask.js';

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

const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '0.00';
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return '0.00';
  }
  return parsed.toFixed(decimals);
};

const normalizeString = (value) => (value ? String(value).trim() : '');

const normalizeAmount = (value) => {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
};

const defaultPortfolioItem = (item) => ({
  propertyCode: normalizeString(item?.propertyCode),
  amount: normalizeAmount(item?.amount),
  priceUsd: normalizeAmount(item?.priceUsd),
  valueUsd: normalizeAmount(item?.valueUsd)
});

const defaultListingItem = (item) => ({
  id: normalizeString(item?.id || item?.listingId || ''),
  propertyCode: normalizeString(item?.propertyCode),
  available: normalizeAmount(item?.available),
  priceUsd: normalizeAmount(item?.priceUsd),
  seller: normalizeString(item?.seller)
});

const getReadProvider = (state, config) => {
  if (config.rpcUrl) {
    return new JsonRpcProvider(config.rpcUrl);
  }
  if (state.ethersProvider) {
    return state.ethersProvider;
  }
  return null;
};

export function initPortfolioWidget(mount, config = {}) {
  if (!mount) {
    return null;
  }

  const state = createWalletState(config);
  const uiState = {
    action: 'idle',
    busy: false
  };

  mount.innerHTML = '';
  mount.classList.add('sqmu-widget');

  const grid = document.createElement('div');
  grid.className = 'sqmu-grid';

  const heading = document.createElement('h3');
  heading.textContent = 'SQMU Portfolio';

  const connectionStatus = document.createElement('p');
  const portfolioStatus = document.createElement('p');
  const listingsStatus = document.createElement('p');
  const actionStatus = document.createElement('p');

  const connectButton = renderButton('Connect MetaMask', 'connect');
  const disconnectButton = renderButton('Disconnect wallet', 'disconnect');

  const loadPortfolioButton = renderButton(
    'Load portfolio',
    'load-portfolio'
  );
  const loadListingsButton = renderButton(
    'Load listings',
    'load-listings'
  );

  const sellPropertyInput = renderInput({
    placeholder: 'Property code'
  });
  const sellAmountInput = renderInput({
    type: 'number',
    min: '0.01',
    step: '0.01',
    placeholder: 'SQMU amount'
  });
  const sellPriceInput = renderInput({
    type: 'number',
    min: '0.01',
    step: '0.01',
    placeholder: 'USD price per SQMU'
  });
  const sellButton = renderButton('Create listing', 'sell');

  const buyListingSelect = renderSelect({ name: 'listing' });
  const paymentTokenSelect = renderSelect({ name: 'payment-token' });
  const buyAmountInput = renderInput({
    type: 'number',
    min: '0.01',
    step: '0.01',
    placeholder: 'SQMU amount'
  });
  const loadPaymentTokensButton = renderButton(
    'Load payment tokens',
    'load-payment-tokens'
  );
  const buyButton = renderButton('Buy SQMU', 'buy');

  const portfolioTable = document.createElement('table');
  const portfolioHead = document.createElement('thead');
  const portfolioBody = document.createElement('tbody');
  const portfolioFoot = document.createElement('tfoot');

  portfolioHead.innerHTML =
    '<tr><th>Property</th><th>SQMU</th><th>USD Price</th><th>Total</th></tr>';

  portfolioTable.append(portfolioHead, portfolioBody, portfolioFoot);

  const listingsTable = document.createElement('table');
  const listingsHead = document.createElement('thead');
  const listingsBody = document.createElement('tbody');

  listingsHead.innerHTML =
    '<tr><th>Property</th><th>Seller</th><th>Price</th><th>Available</th></tr>';

  listingsTable.append(listingsHead, listingsBody);

  const ensureConnected = () => {
    if (!state.connected) {
      throw new Error('Connect MetaMask first.');
    }
  };

  const setUiState = (action, message) => {
    uiState.action = action;
    uiState.busy = action !== 'idle';
    if (message) {
      renderStatus(actionStatus, message);
    }
    updateControls();
  };

  const updateConnectionStatus = () => {
    renderStatus(
      connectionStatus,
      state.connected
        ? `Connected to ${state.account ?? ''}`
        : 'Wallet not connected.'
    );
  };

  const updateControls = () => {
    const busy = uiState.busy;
    connectButton.button.disabled = busy || state.connected;
    disconnectButton.button.disabled = busy || !state.connected;
    loadPortfolioButton.button.disabled = busy || !state.connected;
    sellButton.button.disabled = busy || !state.connected;
    loadListingsButton.button.disabled = busy;
    loadPaymentTokensButton.button.disabled = busy;
    buyButton.button.disabled = busy || !state.connected;
  };

  const getDistributorContract = () => {
    const address =
      normalizeString(config.distributorAddress) ||
      defaultDistributorAddress ||
      '';
    if (!address) {
      return null;
    }
    const provider = getReadProvider(state, config);
    if (!provider) {
      return null;
    }
    return createDistributorReadOnly({ provider, address });
  };

  const renderPortfolio = (items) => {
    portfolioBody.innerHTML = '';
    portfolioFoot.innerHTML = '';

    if (!items.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'No portfolio entries loaded.';
      row.appendChild(cell);
      portfolioBody.appendChild(row);
      return;
    }

    let totalAmount = 0;
    let totalValue = 0;

    items.forEach((entry) => {
      const row = document.createElement('tr');
      const amount = entry.amount ?? 0;
      const price = entry.priceUsd ?? 0;
      const value = entry.valueUsd ?? amount * price;
      totalAmount += amount;
      totalValue += value;

      row.innerHTML = `
        <td>${entry.propertyCode || '—'}</td>
        <td>${formatNumber(amount)}</td>
        <td>${formatUsd(price)}</td>
        <td>${formatUsd(value)}</td>
      `;
      portfolioBody.appendChild(row);
    });

    const totalRow = document.createElement('tr');
    totalRow.innerHTML = `
      <td><strong>Total</strong></td>
      <td><strong>${formatNumber(totalAmount)}</strong></td>
      <td></td>
      <td><strong>${formatUsd(totalValue)}</strong></td>
    `;
    portfolioFoot.appendChild(totalRow);
  };

  const updateListingSelect = (listings) => {
    buyListingSelect.innerHTML = '';
    if (!listings.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No listings available';
      buyListingSelect.appendChild(option);
      return;
    }

    listings.forEach((listing) => {
      const option = document.createElement('option');
      option.value = listing.id || listing.propertyCode;
      option.textContent = `${listing.propertyCode || 'Unknown'} — ${formatUsd(
        listing.priceUsd
      )}`;
      buyListingSelect.appendChild(option);
    });
  };

  const updatePaymentTokens = (tokens) => {
    paymentTokenSelect.innerHTML = '';
    if (!tokens.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No payment tokens';
      paymentTokenSelect.appendChild(option);
      return;
    }
    tokens.forEach((token) => {
      const option = document.createElement('option');
      option.value = token;
      option.textContent = token;
      paymentTokenSelect.appendChild(option);
    });
    if (config.paymentToken) {
      paymentTokenSelect.value = config.paymentToken;
    }
  };

  const renderListings = (items) => {
    listingsBody.innerHTML = '';

    if (!items.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'No listings available.';
      row.appendChild(cell);
      listingsBody.appendChild(row);
      return;
    }

    items.forEach((listing) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${listing.propertyCode || '—'}</td>
        <td>${listing.seller || '—'}</td>
        <td>${formatUsd(listing.priceUsd)}</td>
        <td>${formatNumber(listing.available)}</td>
      `;
      listingsBody.appendChild(row);
    });
  };

  const resolvePortfolioPricing = async (items) => {
    const contract = getDistributorContract();
    if (!contract) {
      return items;
    }
    return Promise.all(
      items.map(async (entry) => {
        if (!entry.propertyCode || entry.amount === null) {
          return entry;
        }
        const sqmuUnits = toSQMUUnits(entry.amount);
        if (sqmuUnits === null) {
          return entry;
        }
        const priceUnits = await contract.getPrice(
          entry.propertyCode,
          sqmuUnits
        );
        const totalUsd = Number(fromSQMUUnits(priceUnits));
        if (Number.isNaN(totalUsd)) {
          return entry;
        }
        const priceUsd =
          entry.amount > 0 ? totalUsd / entry.amount : totalUsd;
        return {
          ...entry,
          priceUsd,
          valueUsd: totalUsd
        };
      })
    );
  };

  const resolveListingPricing = async (items) => {
    const contract = getDistributorContract();
    if (!contract) {
      return items;
    }
    const priceCache = new Map();
    return Promise.all(
      items.map(async (listing) => {
        if (!listing.propertyCode) {
          return listing;
        }
        if (priceCache.has(listing.propertyCode)) {
          return {
            ...listing,
            priceUsd: priceCache.get(listing.propertyCode)
          };
        }
        const sqmuUnits = toSQMUUnits(1);
        if (sqmuUnits === null) {
          return listing;
        }
        const priceUnits = await contract.getPrice(
          listing.propertyCode,
          sqmuUnits
        );
        const priceUsd = Number(fromSQMUUnits(priceUnits));
        if (Number.isNaN(priceUsd)) {
          return listing;
        }
        priceCache.set(listing.propertyCode, priceUsd);
        return {
          ...listing,
          priceUsd
        };
      })
    );
  };

  const loadPaymentTokens = async () => {
    setUiState('loadPaymentTokens', 'Loading payment tokens...');
    try {
      const contract = getDistributorContract();
      if (!contract) {
        throw new Error('Connect wallet or supply an RPC URL for tokens.');
      }
      const tokens = await contract.getPaymentTokens();
      updatePaymentTokens(tokens);
      renderStatus(listingsStatus, 'Payment tokens updated.');
      setUiState('idle', 'Payment tokens loaded.');
    } catch (error) {
      renderActionError(listingsStatus, 'Load payment tokens', error);
      setUiState('idle');
    }
  };

  const loadPortfolio = async () => {
    ensureConnected();
    setUiState('loadPortfolio', 'Loading portfolio...');
    try {
      const entries =
        (await config.loadPortfolio?.({ account: state.account, state })) ??
        config.portfolio ??
        [];
      const normalized = entries.map(defaultPortfolioItem);
      const priced = await resolvePortfolioPricing(normalized);
      renderPortfolio(priced);
      renderStatus(portfolioStatus, 'Portfolio updated.');
      setUiState('idle', 'Portfolio loaded.');
    } catch (error) {
      renderActionError(portfolioStatus, 'Load portfolio', error);
      setUiState('idle');
    }
  };

  const loadListings = async () => {
    setUiState('loadListings', 'Loading listings...');
    try {
      const listings =
        (await config.loadListings?.({ state })) ?? config.listings ?? [];
      const normalized = listings.map(defaultListingItem);
      const priced = await resolveListingPricing(normalized);
      renderListings(priced);
      updateListingSelect(priced);
      renderStatus(listingsStatus, 'Listings updated.');
      setUiState('idle', 'Listings loaded.');
    } catch (error) {
      renderActionError(listingsStatus, 'Load listings', error);
      setUiState('idle');
    }
  };

  const sell = async () => {
    ensureConnected();
    const propertyCode = normalizeString(sellPropertyInput.value);
    const amount = normalizeAmount(sellAmountInput.value);
    const priceUsd = normalizeAmount(sellPriceInput.value);

    if (!propertyCode || amount === null || priceUsd === null) {
      renderStatus(actionStatus, 'Enter a property code, amount, and price.');
      return;
    }

    if (typeof config.sell !== 'function') {
      renderStatus(actionStatus, 'Sell handler is not configured.');
      return;
    }

    setUiState('sell', 'Creating listing...');
    try {
      await config.sell({
        propertyCode,
        amount,
        priceUsd,
        account: state.account,
        state
      });
      renderStatus(actionStatus, 'Listing created.');
      sellAmountInput.value = '';
      sellPriceInput.value = '';
      setUiState('idle');
    } catch (error) {
      renderActionError(actionStatus, 'Sell', error);
      setUiState('idle');
    }
  };

  const buy = async () => {
    ensureConnected();
    const listingId = normalizeString(buyListingSelect.value);
    const amount = normalizeAmount(buyAmountInput.value);
    const paymentToken = normalizeString(paymentTokenSelect.value);

    if (!listingId || amount === null) {
      renderStatus(actionStatus, 'Select a listing and enter an amount.');
      return;
    }

    if (typeof config.buy !== 'function') {
      renderStatus(actionStatus, 'Buy handler is not configured.');
      return;
    }

    if (paymentTokenSelect.options.length && !paymentToken) {
      renderStatus(actionStatus, 'Select a payment token.');
      return;
    }

    setUiState('buy', 'Submitting purchase...');
    try {
      await config.buy({
        listingId,
        amount,
        paymentToken,
        account: state.account,
        state
      });
      renderStatus(actionStatus, 'Purchase submitted.');
      buyAmountInput.value = '';
      setUiState('idle');
    } catch (error) {
      renderActionError(actionStatus, 'Buy', error);
      setUiState('idle');
    }
  };

  connectButton.button.addEventListener('click', async () => {
    setUiState('connect', 'Connecting to MetaMask...');
    try {
      await state.connect();
      renderStatus(actionStatus, 'Connected.');
      setUiState('idle');
    } catch (error) {
      renderActionError(actionStatus, 'Connection', error);
      setUiState('idle');
    }
  });

  disconnectButton.button.addEventListener('click', async () => {
    setUiState('disconnect', 'Disconnecting wallet...');
    try {
      await state.disconnect?.();
      renderStatus(actionStatus, 'Disconnected.');
      setUiState('idle');
    } catch (error) {
      renderActionError(actionStatus, 'Disconnect', error);
      setUiState('idle');
    }
  });

  loadPortfolioButton.button.addEventListener('click', () => {
    loadPortfolio();
  });

  loadListingsButton.button.addEventListener('click', () => {
    loadListings();
  });

  loadPaymentTokensButton.button.addEventListener('click', () => {
    loadPaymentTokens();
  });

  sellButton.button.addEventListener('click', () => {
    sell();
  });

  buyButton.button.addEventListener('click', () => {
    buy();
  });

  grid.append(
    heading,
    connectionStatus,
    connectButton.wrapper,
    disconnectButton.wrapper,
    actionStatus,
    document.createElement('hr'),
    renderField('Portfolio status', portfolioStatus),
    loadPortfolioButton.wrapper,
    portfolioTable,
    document.createElement('hr'),
    renderField('Sell property', sellPropertyInput),
    renderField('SQMU amount', sellAmountInput),
    renderField('USD price per SQMU', sellPriceInput),
    sellButton.wrapper,
    document.createElement('hr'),
    renderField('Listings status', listingsStatus),
    loadListingsButton.wrapper,
    listingsTable,
    renderField('Buy listing', buyListingSelect),
    loadPaymentTokensButton.wrapper,
    renderField('Payment token', paymentTokenSelect),
    renderField('SQMU amount', buyAmountInput),
    buyButton.wrapper
  );

  mount.appendChild(grid);

  renderStatus(actionStatus, 'Ready.');
  renderStatus(portfolioStatus, 'Portfolio not loaded.');
  renderStatus(listingsStatus, 'Listings not loaded.');

  renderPortfolio((config.portfolio ?? []).map(defaultPortfolioItem));
  renderListings((config.listings ?? []).map(defaultListingItem));
  updateListingSelect((config.listings ?? []).map(defaultListingItem));
  updatePaymentTokens(config.paymentTokens ?? []);

  state.subscribe(() => {
    updateConnectionStatus();
    updateControls();
  });

  updateConnectionStatus();
  updateControls();

  return state;
}
