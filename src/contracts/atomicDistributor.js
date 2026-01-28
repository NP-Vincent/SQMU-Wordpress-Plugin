import { getEthers } from '../lib/ethers.js';
import distributorDefinition from '../../contracts/abi/AtomicSQMUDistributor.json';

export const distributorAbi = distributorDefinition.abi;
export const defaultDistributorAddress = distributorDefinition.address;

export function createDistributorContract({ signer, address }) {
  const { Contract } = getEthers();
  return new Contract(address, distributorAbi, signer);
}

export function createDistributorReadOnly({ provider, address }) {
  const { Contract } = getEthers();
  return new Contract(address, distributorAbi, provider);
}
