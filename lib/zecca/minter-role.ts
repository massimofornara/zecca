import { encodeFunctionData, keccak256, toBytes, type Address, type Hex } from "viem";

/** Stesso valore di `keccak256("MINTER_ROLE")` in ZeccaToken.sol / OpenZeppelin. */
export const MINTER_ROLE = keccak256(toBytes("MINTER_ROLE"));

export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export const ACCESS_CONTROL_ABI = [
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "grantRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "MINTER_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
] as const;

export function encodeGrantMinterRole(account: Address): Hex {
  return encodeFunctionData({
    abi: ACCESS_CONTROL_ABI,
    functionName: "grantRole",
    args: [MINTER_ROLE, account],
  });
}

export function encodeHasMinterRole(account: Address): Hex {
  return encodeFunctionData({
    abi: ACCESS_CONTROL_ABI,
    functionName: "hasRole",
    args: [MINTER_ROLE, account],
  });
}
