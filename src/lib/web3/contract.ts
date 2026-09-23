import { sepolia } from "wagmi/chains";
import type { Address } from "viem";

export const SEPOLIA_CHAIN_ID = sepolia.id;
export const DEFAULT_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const SEPOLIA_RPC_URL = import.meta.env["VITE_SEPOLIA_RPC_URL"]?.trim() || DEFAULT_SEPOLIA_RPC_URL;

const contractAddressValue = import.meta.env["VITE_PROMISECHAIN_CONTRACT_ADDRESS"]?.trim();

export const PROMISECHAIN_CONTRACT_ADDRESS = contractAddressValue
  ? (contractAddressValue as Address)
  : undefined;

export const PROMISECHAIN_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "_initialResolver", type: "address" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "createCommitment",
    stateMutability: "payable",
    inputs: [
      { name: "_beneficiary", type: "address" },
      { name: "_deadline", type: "uint256" },
      { name: "_description", type: "string" },
      { name: "_evidenceType", type: "string" },
      { name: "_evidenceReference", type: "string" },
    ],
    outputs: [{ name: "commitmentId", type: "uint256" }],
  },
  {
    type: "function",
    name: "getCommitment",
    stateMutability: "view",
    inputs: [{ name: "_id", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "creator", type: "address" },
          { name: "beneficiary", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "description", type: "string" },
          { name: "evidenceType", type: "string" },
          { name: "evidenceReference", type: "string" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "nextCommitmentId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "resolveCommitment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_id", type: "uint256" },
      { name: "_success", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolver",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "setResolver",
    stateMutability: "nonpayable",
    inputs: [{ name: "_newResolver", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "submitEvidence",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_id", type: "uint256" },
      { name: "_evidenceType", type: "string" },
      { name: "_evidenceReference", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "CommitmentCreated",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "beneficiary", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "deadline", type: "uint256", indexed: false },
      { name: "description", type: "string", indexed: false },
      { name: "evidenceType", type: "string", indexed: false },
      { name: "evidenceReference", type: "string", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "CommitmentResolved",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "status", type: "uint8", indexed: false },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "EvidenceSubmitted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "evidenceType", type: "string", indexed: false },
      { name: "evidenceReference", type: "string", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "ResolverUpdated",
    inputs: [
      { name: "oldResolver", type: "address", indexed: true },
      { name: "newResolver", type: "address", indexed: true },
    ],
    anonymous: false,
  },
] as const;

export function isPromiseChainConfigured() {
  return Boolean(PROMISECHAIN_CONTRACT_ADDRESS);
}
