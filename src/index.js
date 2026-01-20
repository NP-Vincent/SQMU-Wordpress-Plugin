import { createWalletState } from './wallet/metamask.js';
import { mountUI } from './ui/index.js';

export function initMetaMaskDapp(config = {}) {
  const state = createWalletState(config);
  mountUI(state, config);
  return state;
}
