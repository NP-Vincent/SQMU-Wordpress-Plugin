import { getEthers } from '../lib/ethers.js';
import tradeDefinition from '../../contracts/abi/SQMUTrade.json';

export const tradeAbi = tradeDefinition.abi;
export const defaultTradeAddress = tradeDefinition.address;

export function createTradeContract({ signer, address }) {
  const { Contract } = getEthers();
  return new Contract(address, tradeAbi, signer);
}

export function createTradeReadOnly({ provider, address }) {
  const { Contract } = getEthers();
  return new Contract(address, tradeAbi, provider);
}
