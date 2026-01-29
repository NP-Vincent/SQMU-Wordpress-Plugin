import { getEthers } from '../lib/ethers.js';
import sqmuDefinition from '../../contracts/abi/SQMU.json';

export const sqmuAbi = sqmuDefinition.abi;
export const defaultSqmuAddress = sqmuDefinition.address;

export function createSqmuContract({ signer, address }) {
  const { Contract } = getEthers();
  return new Contract(address, sqmuAbi, signer);
}

export function createSqmuReadOnly({ provider, address }) {
  const { Contract } = getEthers();
  return new Contract(address, sqmuAbi, provider);
}
