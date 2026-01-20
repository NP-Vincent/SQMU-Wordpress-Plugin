export function mountUI(state, config = {}) {
  const mountSelector = config.mountSelector || '#metamask-dapp';
  const mount = document.querySelector(mountSelector);

  if (!mount) {
    return;
  }

  mount.innerHTML = '';
  const heading = document.createElement('h2');
  heading.textContent = 'MetaMask WordPress dApp';
  const status = document.createElement('p');
  status.textContent = state.connected
    ? `Connected: ${state.account}`
    : 'Wallet not connected.';

  mount.appendChild(heading);
  mount.appendChild(status);
}
