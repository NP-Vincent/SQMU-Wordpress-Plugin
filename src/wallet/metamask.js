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

  const toHexChainId = (chainId) => {
    const normalized = normalizeChainId(chainId);
    if (!normalized) {
      return null;
    }
    return `0x${normalized.toString(16)}`;
  };

  const isUnknownChainError = (error) =>
    error?.code === 4902 || error?.data?.originalError?.code === 4902;

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
    },
    async ensureChain(chainId = config.chainId) {
      const expected = normalizeChainId(chainId);
      if (!expected || !state.provider?.request) {
        return;
      }
      if (state.chainId && state.chainId === expected) {
        return;
      }
      const hexChainId = toHexChainId(expected);
      if (!hexChainId) {
        return;
      }
      let currentChain = null;
      try {
        await state.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: hexChainId }]
        });
        currentChain = await state.provider
          .request({ method: 'eth_chainId' })
          .catch(() => null);
      } catch (error) {
        if (!isUnknownChainError(error)) {
          throw error;
        }
        await state.provider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: hexChainId,
              chainName: config.chainName,
              rpcUrls: config.rpcUrl ? [config.rpcUrl] : [],
              nativeCurrency: config.nativeCurrency,
              blockExplorerUrls: config.blockExplorerUrl
                ? [config.blockExplorerUrl]
                : []
            }
          ]
        });
        currentChain = await state.provider
          .request({ method: 'eth_chainId' })
          .catch(() => null);
        if (normalizeChainId(currentChain) !== expected) {
          await state.provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: hexChainId }]
          });
          currentChain = await state.provider
            .request({ method: 'eth_chainId' })
            .catch(() => null);
        }
      }
      updateChainId(currentChain ?? expected);
      notify();
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
    const provider =
      sdk.getProvider() ||
      (typeof window !== 'undefined' ? window.ethereum : null);
    if (!provider) {
      throw new Error('MetaMask provider not found. Ensure the extension is available.');
    }
    attachProvider(provider);
    state.ethersProvider = new BrowserProvider(provider);
    state.signer = state.connected ? await state.ethersProvider.getSigner() : null;
    const network = await state.ethersProvider.getNetwork();
    updateChainId(Number(network.chainId));
    await state.ensureChain();
    if (state.ethersProvider) {
      const refreshedNetwork = await state.ethersProvider.getNetwork();
      updateChainId(Number(refreshedNetwork.chainId));
    }
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

  attachProvider(sdk.getProvider());

  return state;
}
