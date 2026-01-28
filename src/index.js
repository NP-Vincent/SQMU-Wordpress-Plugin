import { createWalletState } from './wallet/metamask.js';
import { mountUI } from './ui/index.js';

export function initMetaMaskDapp(config = {}) {
  const state = createWalletState(config);
  mountUI(state, config);
  return state;
}

const bootMetaMaskDapp = () => {
  if (typeof window === 'undefined') {
    return;
  }
  const config = window.metamaskDappConfig || {};
  if (!config || Object.keys(config).length === 0) {
    return;
  }
  initMetaMaskDapp(config);
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootMetaMaskDapp, {
      once: true
    });
  } else {
    bootMetaMaskDapp();
  }
}
