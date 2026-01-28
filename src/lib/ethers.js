import { ethers as importedEthers } from 'ethers';

export const getEthers = () => {
  if (typeof window !== 'undefined' && window.ethers) {
    return window.ethers;
  }
  return importedEthers;
};
