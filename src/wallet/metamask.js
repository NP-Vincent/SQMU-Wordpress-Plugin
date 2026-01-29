import { MetaMaskSDK as ImportedMetaMaskSDK } from '@metamask/sdk';
import { getEthers } from '../lib/ethers.js';

const DEFAULT_DAPP_METADATA = {
  name: 'SQMU Distributor',
  url: typeof window !== 'undefined' ? window.location.href : ''
};

export function createWalletState(config = {}) {
  const listeners = new Set();
  const MetaMaskSDK =
    typeof window !== 'undefined' && window.MetaMaskSDK
      ? window.MetaMaskSDK
      : ImportedMetaMaskSDK;
  const sdk = new MetaMaskSDK({
    dappMetadata: config.dappMetadata ?? DEFAULT_DAPP_METADATA,
    infuraAPIKey: config.infuraApiKey ?? config.infuraAPIKey
  });

  const state = {
    connected: false,
    account: null,
    chainId: config.chainId ?? null,
    sdk,
    provider: null,
    ethersProvider: null,
    signer: null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

  const getWindowProvider = () =>
    typeof window !== 'undefined' ? window.ethereum : null;

  const notify = () => {
    listeners.forEach((listener) => listener(state));
  };

  const updateChainId = (chainId) => {
    if (typeof chainId === 'string') {
      state.chainId = chainId.startsWith('0x')
        ? Number.parseInt(chainId, 16)
        : Number.parseInt(chainId, 10);
    } else if (typeof chainId === 'number') {
      state.chainId = chainId;
    }
  };

  const attachProvider = (provider) => {
    if (!provider || provider === state.provider) {
      return;
    }
    state.provider = provider;
    if (provider.on) {
      provider.on('accountsChanged', (accounts) => {
        state.account = accounts?.[0] ?? null;
        state.connected = Boolean(state.account);
        notify();
      });

      provider.on('chainChanged', (chainId) => {
        updateChainId(chainId);
        notify();
      });
    }
  };

  state.connect = async () => {
    const accounts = await sdk.connect();
    state.connected = Array.isArray(accounts) && accounts.length > 0;
    state.account = accounts?.[0] ?? null;
    const provider = getWindowProvider() || sdk.getProvider();
    if (!provider) {
      throw new Error('MetaMask provider not found. Ensure the extension is available.');
    }
    attachProvider(provider);
    const ethers = getEthers();
    state.ethersProvider = new ethers.providers.Web3Provider(provider);
    state.signer = state.connected ? state.ethersProvider.getSigner() : null;
    const network = await state.ethersProvider.getNetwork();
    updateChainId(Number(network.chainId));
    notify();
    return state;
  };

  state.disconnect = async () => {
    if (typeof sdk.disconnect === 'function') {
      await sdk.disconnect();
    }
    state.connected = false;
    state.account = null;
    state.signer = null;
    state.ethersProvider = null;
    notify();
  };

  const initialProvider = getWindowProvider();
  if (initialProvider) {
    attachProvider(initialProvider);
  }

  return state;
}
