import { Contract } from 'ethers';

const erc1155Abi = [
  'function balanceOfBatch(address[] accounts, uint256[] ids) external view returns (uint256[])',
  'function isApprovedForAll(address account, address operator) external view returns (bool)',
  'function setApprovalForAll(address operator, bool approved) external'
];

export function createErc1155Contract({ signer, address }) {
  return new Contract(address, erc1155Abi, signer);
}
