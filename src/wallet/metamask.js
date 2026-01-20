export function createWalletState(config = {}) {
  return {
    connected: false,
    account: null,
    chainId: config.chainId ?? null
  };
}
