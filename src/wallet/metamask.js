import { MetaMaskSDK } from '@metamask/sdk';
import { BrowserProvider } from 'ethers';

const DEFAULT_DAPP_METADATA = {
  name: 'SQMU Distributor',
  url: typeof window !== 'undefined' ? window.location.href : ''
};

export function createWalletState(config = {}) {
  const listeners = new Set();
  const sdk = new MetaMaskSDK({
    dappMetadata: config.dappMetadata ?? DEFAULT_DAPP_METADATA,
    infuraAPIKey: config.infuraApiKey ?? config.infuraAPIKey
  });
  const provider = sdk.getProvider();

  const state = {
    connected: false,
    account: null,
    chainId: config.chainId ?? null,
    sdk,
    provider,
    ethersProvider: null,
    signer: null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };

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

  state.connect = async () => {
    const accounts = await sdk.connect();
    state.connected = Array.isArray(accounts) && accounts.length > 0;
    state.account = accounts?.[0] ?? null;
    state.ethersProvider = new BrowserProvider(provider);
    state.signer = state.connected ? await state.ethersProvider.getSigner() : null;
    const network = await state.ethersProvider.getNetwork();
    updateChainId(Number(network.chainId));
    notify();
    return state;
  };

  if (provider?.on) {
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

  return state;
}
