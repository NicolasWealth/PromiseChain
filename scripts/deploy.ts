import { promises as fs } from "node:fs";
import path from "node:path";

import hardhat from "hardhat";
import { isAddress } from "ethers";

const { ethers } = hardhat;

const ENV_PATH = path.resolve(process.cwd(), ".env.local");

async function upsertEnv(key: string, value: string) {
  const entry = `${key}=${value}`;
  let contents = "";

  try {
    contents = await fs.readFile(ENV_PATH, "utf8");
  } catch {
    contents = "";
  }

  const lines = contents
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.startsWith(`${key}=`));
  lines.push(entry);

  await fs.writeFile(ENV_PATH, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required before deploying to Sepolia.");
  }

  if (!process.env.SEPOLIA_RPC_URL) {
    throw new Error("SEPOLIA_RPC_URL is required before deploying to Sepolia.");
  }

  const [deployer] = await ethers.getSigners();
  const resolver = process.env.RESOLVER_ADDRESS || deployer.address;
  if (!isAddress(resolver)) {
    throw new Error("RESOLVER_ADDRESS must be a valid Ethereum address.");
  }

  const factory = await ethers.getContractFactory("CommitChain");
  const contract = await factory.deploy(resolver);
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  console.log(`PromiseChain deployed to ${contractAddress}`);
  console.log(`Resolver: ${resolver}`);
  console.log(`Owner: ${deployer.address}`);

  await upsertEnv("PROMISECHAIN_CONTRACT_ADDRESS", contractAddress);
  await upsertEnv("VITE_PROMISECHAIN_CONTRACT_ADDRESS", contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
