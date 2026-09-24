import {
  createPublicClient,
  formatEther,
  getAddress,
  http,
  isAddress,
  parseAbiItem,
  parseEventLogs,
  parseEther,
} from "viem";
import type { Address } from "viem";
import { readContract, waitForTransactionReceipt, writeContract } from "viem/actions";
import { getConnectorClient } from "wagmi/actions";
import { sepolia } from "wagmi/chains";

import { wagmiConfig } from "@/lib/web3/config";

import {
  SEPOLIA_RPC_URL,
  PROMISECHAIN_ABI,
  PROMISECHAIN_CONTRACT_ADDRESS,
  isPromiseChainConfigured,
} from "@/lib/web3/contract";
import {
  commitments as mockCommitments,
  currentCommitment,
  getCommitment as getMockCommitment,
} from "./mockData";
import type { Commitment } from "./mockData";

type CommitmentMode = "chain" | "demo";

export type BlockchainCommitment = Omit<
  Commitment,
  | "daysRemaining"
  | "submittedAt"
  | "verifiedAt"
  | "resolvedAt"
  | "mergeDate"
  | "releaseHash"
  | "transactionHash"
> & {
  mode: CommitmentMode;
  evidenceType: string;
  evidenceReference: string;
  creatorAddress?: Address | undefined;
  beneficiaryAddress?: Address | undefined;
  contractAddress?: Address | undefined;
  resolver?: Address | undefined;
  onChainId?: string | undefined;
  transactionHash?: string | undefined;
  daysRemaining?: number | undefined;
  submittedAt?: string | undefined;
  verifiedAt?: string | undefined;
  resolvedAt?: string | undefined;
  mergeDate?: string | undefined;
  releaseHash?: string | undefined;
  evidenceHash?: string | undefined;
  blockNumber?: bigint | undefined;
  confirmationStatus?: "confirmed" | "reverted" | "pending" | "unavailable" | undefined;
};

export type CreateCommitmentInput = {
  title: string;
  description: string;
  beneficiary: string;
  amount: string;
  deadline: string;
  evidenceType: string;
  evidenceReference: string;
};

export type PromiseChainActionResult = {
  commitmentId: string;
  transactionHash: string;
  commitment: BlockchainCommitment;
  mode: CommitmentMode;
};

export type PromiseChainTransactionInfo = {
  hash: string;
  network: string;
  status: "confirmed" | "reverted" | "pending" | "unavailable";
  block?: string;
  blockNumber?: string;
  confirmationStatus?: "confirmed" | "reverted" | "pending" | "unavailable";
};

const demoCommitments = new Map<string, BlockchainCommitment>();
const chainCommitmentCache = new Map<string, BlockchainCommitment>();

const utcFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const commitmentCreatedEvent = parseAbiItem(
  "event CommitmentCreated(uint256 indexed id, address indexed creator, address indexed beneficiary, uint256 amount, uint256 deadline, string description, string evidenceType, string evidenceReference)",
);

const commitmentResolvedEvent = parseAbiItem(
  "event CommitmentResolved(uint256 indexed id, uint8 status, address indexed recipient, uint256 amount)",
);

const evidenceSubmittedEvent = parseAbiItem(
  "event EvidenceSubmitted(uint256 indexed id, string evidenceType, string evidenceReference)",
);

function formatUtcTimestamp(timestamp: number) {
  return `${utcFormatter.format(new Date(timestamp * 1000))} UTC`;
}

function formatUtcDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1000));
}

function parseDeadline(value: string) {
  const timestamp = Date.parse(`${value}T23:59:59Z`);
  if (Number.isNaN(timestamp)) {
    throw new Error("Invalid deadline date");
  }

  const deadline = Math.floor(timestamp / 1000);
  if (deadline <= Math.floor(Date.now() / 1000)) {
    throw new Error("Deadline must be in the future");
  }

  return deadline;
}

function shortAddress(address: string) {
  const checksummed = getAddress(address);
  return `${checksummed.slice(0, 6)}...${checksummed.slice(-4)}`;
}

function parseDescription(description: string) {
  const [title = "", ...rest] = description.split(/\n\s*\n/);
  const body = rest.join("\n\n").trim();
  return {
    title: title.trim() || description.trim(),
    description: body || title.trim() || description.trim(),
  };
}

function parsePullRequestNumber(reference: string) {
  const match = reference.match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : 0;
}

function makeReference(id: string) {
  const numeric = Number(id);
  if (Number.isFinite(numeric)) {
    return `COM-${String(numeric).padStart(4, "0")}`;
  }

  return `COM-${id.slice(0, 8).toUpperCase()}`;
}

function buildCurrentTimeLabel() {
  return formatUtcTimestamp(Math.floor(Date.now() / 1000));
}

function createDemoHash(prefix: string) {
  const random = Math.random().toString(16).slice(2).padEnd(64, "0").slice(0, 64);
  return `0x${prefix}${random}`.slice(0, 66);
}

function requireContractAddress() {
  if (!PROMISECHAIN_CONTRACT_ADDRESS) {
    throw new Error("PromiseChain contract address is not configured");
  }

  return PROMISECHAIN_CONTRACT_ADDRESS;
}

async function getLivePublicClient() {
  return createPublicClient({
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
  });
}

async function getBrowserWalletClient() {
  if (typeof window === "undefined") {
    throw new Error("Wallet interactions are only available in the browser");
  }
  try {
    return await getConnectorClient(wagmiConfig);
  } catch {
    throw new Error("Connect your wallet using the navbar button before continuing");
  }
}

async function getBlockTimestampLabel(
  publicClient: Awaited<ReturnType<typeof getLivePublicClient>>,
  blockNumber: bigint,
) {
  const block = await publicClient.getBlock({ blockNumber });
  return formatUtcTimestamp(Number(block.timestamp));
}

async function findEventLog(
  publicClient: Awaited<ReturnType<typeof getLivePublicClient>>,
  contractAddress: Address,
  event:
    typeof commitmentCreatedEvent | typeof commitmentResolvedEvent | typeof evidenceSubmittedEvent,
  id: bigint,
) {
  const logs = await publicClient.getLogs({
    address: contractAddress,
    event,
    args: { id },
    fromBlock: 0n,
    toBlock: "latest",
  });

  return logs.at(-1);
}

function buildCommitmentView({
  id,
  title,
  description,
  creator,
  beneficiary,
  amount,
  deadline,
  evidenceType,
  evidenceReference,
  status,
  transactionHash,
  mode,
  creatorAddress,
  beneficiaryAddress,
  createdAt,
  lockedAt,
  submittedAt,
  verifiedAt,
  resolvedAt,
  releaseHash,
  evidenceHash,
  resolver,
  contractAddress,
  onChainId,
  blockNumber,
  confirmationStatus,
}: {
  id: string;
  title: string;
  description: string;
  creator: string;
  beneficiary: string;
  amount: string;
  deadline: number;
  evidenceType: string;
  evidenceReference: string;
  status: Commitment["status"];
  transactionHash?: string | undefined;
  mode: CommitmentMode;
  creatorAddress?: Address | undefined;
  beneficiaryAddress?: Address | undefined;
  createdAt?: string | undefined;
  lockedAt?: string | undefined;
  submittedAt?: string | undefined;
  verifiedAt?: string | undefined;
  resolvedAt?: string | undefined;
  releaseHash?: string | undefined;
  evidenceHash?: string | undefined;
  resolver?: Address | undefined;
  contractAddress?: Address | undefined;
  onChainId?: string | undefined;
  blockNumber?: bigint | undefined;
  confirmationStatus?: "confirmed" | "reverted" | "pending" | "unavailable" | undefined;
}): BlockchainCommitment {
  const parsedDescription = parseDescription(description);
  const progress =
    status === "completed" ? 100 : status === "failed" ? 0 : evidenceReference ? 68 : 34;

  return {
    id,
    reference: makeReference(id),
    title: title || parsedDescription.title,
    description: parsedDescription.description,
    status,
    amount,
    token: "ETH",
    deadline: formatUtcDate(deadline),
    deadlineShort: formatUtcDate(deadline),
    daysRemaining:
      status === "active"
        ? Math.max(0, Math.ceil((deadline * 1000 - Date.now()) / 86_400_000))
        : undefined,
    progress,
    creator,
    beneficiary,
    beneficiaryLabel: "Beneficiary",
    condition:
      evidenceType && evidenceReference
        ? `${evidenceType} / ${evidenceReference}`
        : evidenceType || evidenceReference || "On-chain escrow",
    repository: evidenceType || "on-chain",
    pullRequest: parsePullRequestNumber(evidenceReference),
    pullRequestTitle: title || parsedDescription.title,
    author: creator,
    createdDate: createdAt ?? buildCurrentTimeLabel(),
    mergeStatus: status === "completed" ? "merged" : status === "failed" ? "not-submitted" : "open",
    mergeDate: verifiedAt,
    createdAt: createdAt ?? buildCurrentTimeLabel(),
    lockedAt: lockedAt ?? buildCurrentTimeLabel(),
    submittedAt,
    verifiedAt,
    resolvedAt,
    transactionHash,
    releaseHash,
    evidenceHash,
    mode,
    evidenceType,
    evidenceReference,
    creatorAddress,
    beneficiaryAddress,
    resolver,
    contractAddress,
    onChainId,
    blockNumber,
    confirmationStatus,
  };
}

export function toCommitmentView(commitment: BlockchainCommitment): Commitment {
  const view: Commitment = {
    id: commitment.id,
    reference: commitment.reference,
    title: commitment.title,
    description: commitment.description,
    status: commitment.status,
    amount: commitment.amount,
    token: commitment.token,
    deadline: commitment.deadline,
    deadlineShort: commitment.deadlineShort,
    progress: commitment.progress,
    creator: commitment.creator,
    beneficiary: commitment.beneficiary,
    beneficiaryLabel: commitment.beneficiaryLabel,
    condition: commitment.condition,
    repository: commitment.repository,
    pullRequest: commitment.pullRequest,
    pullRequestTitle: commitment.pullRequestTitle,
    author: commitment.author,
    createdDate: commitment.createdDate,
    mergeStatus: commitment.mergeStatus,
    createdAt: commitment.createdAt,
    lockedAt: commitment.lockedAt,
    transactionHash: commitment.transactionHash ?? "Unavailable",
  };

  if (commitment.daysRemaining !== undefined) {
    view.daysRemaining = commitment.daysRemaining;
  }
  if (commitment.mergeDate !== undefined) {
    view.mergeDate = commitment.mergeDate;
  }
  if (commitment.submittedAt !== undefined) {
    view.submittedAt = commitment.submittedAt;
  }
  if (commitment.verifiedAt !== undefined) {
    view.verifiedAt = commitment.verifiedAt;
  }
  if (commitment.resolvedAt !== undefined) {
    view.resolvedAt = commitment.resolvedAt;
  }
  if (commitment.releaseHash !== undefined) {
    view.releaseHash = commitment.releaseHash;
  }

  return view;
}

const passportScanLimit = 250;
const demoPassportAddress = getAddress("0x3f8c000000000000000000000000000000009a2b");

export type PromisePassportHistory = {
  address: Address;
  mode: CommitmentMode;
  commitments: BlockchainCommitment[];
  scannedCommitments: number;
  scanLimitReached: boolean;
};

function createDemoCommitment(input: CreateCommitmentInput, id: string) {
  const deadline = parseDeadline(input.deadline);
  const description = `${input.title}\n\n${input.description}`.trim();
  const commitment = buildCommitmentView({
    id,
    title: input.title,
    description,
    creator: shortAddress(demoPassportAddress),
    creatorAddress: demoPassportAddress,
    beneficiary: shortAddress(input.beneficiary),
    beneficiaryAddress: getAddress(input.beneficiary),
    amount: Number(input.amount).toLocaleString("en-US", {
      minimumFractionDigits: Number.isInteger(Number(input.amount)) ? 0 : 3,
      maximumFractionDigits: 6,
    }),
    deadline,
    evidenceType: input.evidenceType,
    evidenceReference: input.evidenceReference,
    status: "active",
    transactionHash: createDemoHash("demo"),
    mode: "demo",
  });

  demoCommitments.set(id, commitment);
  return commitment;
}

function resolveDemoCommitment(
  id: string,
  success: boolean,
  evidenceType?: string,
  evidenceReference?: string,
) {
  const commitment = demoCommitments.get(id);
  if (!commitment) {
    throw new Error("Commitment not found");
  }

  if (commitment.status === "completed" || commitment.status === "failed") {
    throw new Error("Commitment already resolved");
  }

  if (!success && Date.parse(`${commitment.deadline}T23:59:59Z`) > Date.now()) {
    throw new Error("Deadline not reached");
  }

  const nextStatus: Commitment["status"] = success ? "completed" : "failed";
  const timestamp = buildCurrentTimeLabel();
  const updated = {
    ...commitment,
    status: nextStatus,
    evidenceType: evidenceType ?? commitment.repository,
    evidenceReference: evidenceReference ?? commitment.condition,
    submittedAt: commitment.submittedAt ?? timestamp,
    verifiedAt: commitment.verifiedAt,
    resolvedAt: timestamp,
    releaseHash: createDemoHash(success ? "rel" : "ref"),
    progress: nextStatus === "completed" ? 100 : 0,
    mergeStatus: success ? ("merged" as const) : ("not-submitted" as const),
    mergeDate: commitment.mergeDate,
    mode: "demo" as const,
    confirmationStatus: "confirmed" as const,
  };

  demoCommitments.set(id, updated);
  return updated;
}

async function readLiveCommitment(id: string) {
  if (!isPromiseChainConfigured()) {
    return null;
  }

  const publicClient = await getLivePublicClient();
  const contractAddress = requireContractAddress();
  const commitmentId = BigInt(id);

  const raw = (await readContract(publicClient, {
    abi: PROMISECHAIN_ABI,
    address: contractAddress,
    functionName: "getCommitment",
    args: [commitmentId],
  })) as {
    id: bigint;
    creator: Address;
    beneficiary: Address;
    amount: bigint;
    deadline: bigint;
    description: string;
    evidenceType: string;
    evidenceReference: string;
    status: number;
  };

  const createdLog = await findEventLog(
    publicClient,
    contractAddress,
    commitmentCreatedEvent,
    commitmentId,
  );
  if (!createdLog) {
    throw new Error("Unable to load commitment from Sepolia");
  }

  const resolvedLog = await findEventLog(
    publicClient,
    contractAddress,
    commitmentResolvedEvent,
    commitmentId,
  );
  const evidenceLog = await findEventLog(
    publicClient,
    contractAddress,
    evidenceSubmittedEvent,
    commitmentId,
  );

  const parsedDescription = parseDescription(raw.description);
  const status = raw.status === 2 ? "completed" : raw.status === 3 ? "failed" : "active";
  const createdAt = await getBlockTimestampLabel(publicClient, createdLog.blockNumber);
  const lockedAt = createdAt;
  const submittedAt = evidenceLog
    ? await getBlockTimestampLabel(publicClient, evidenceLog.blockNumber)
    : undefined;
  const resolvedAt = resolvedLog
    ? await getBlockTimestampLabel(publicClient, resolvedLog.blockNumber)
    : undefined;

  const commitment = buildCommitmentView({
    id,
    title: parsedDescription.title,
    description: parsedDescription.description,
    creator: shortAddress(raw.creator),
    beneficiary: shortAddress(raw.beneficiary),
    creatorAddress: raw.creator,
    beneficiaryAddress: raw.beneficiary,
    amount: formatEther(raw.amount),
    deadline: Number(raw.deadline),
    evidenceType: raw.evidenceType,
    evidenceReference: raw.evidenceReference,
    status,
    transactionHash: createdLog.transactionHash,
    mode: "chain",
    createdAt,
    lockedAt,
    submittedAt,
    resolvedAt,
    releaseHash: resolvedLog?.transactionHash,
    evidenceHash: evidenceLog?.transactionHash,
    resolver: (await readContract(publicClient, {
      abi: PROMISECHAIN_ABI,
      address: contractAddress,
      functionName: "resolver",
    })) as Address,
    contractAddress,
    onChainId: id,
    blockNumber: createdLog.blockNumber,
    confirmationStatus: "confirmed",
  });

  chainCommitmentCache.set(id, commitment);
  return commitment;
}

async function readRawLiveCommitment(id: string) {
  const publicClient = await getLivePublicClient();
  const contractAddress = requireContractAddress();

  return (await readContract(publicClient, {
    abi: PROMISECHAIN_ABI,
    address: contractAddress,
    functionName: "getCommitment",
    args: [BigInt(id)],
  })) as {
    id: bigint;
    creator: Address;
    beneficiary: Address;
    amount: bigint;
    deadline: bigint;
    description: string;
    evidenceType: string;
    evidenceReference: string;
    status: number;
  };
}

async function readLivePassportHistory(address: Address): Promise<PromisePassportHistory> {
  const publicClient = await getLivePublicClient();
  const contractAddress = requireContractAddress();
  const nextCommitmentId = (await readContract(publicClient, {
    abi: PROMISECHAIN_ABI,
    address: contractAddress,
    functionName: "nextCommitmentId",
  })) as bigint;

  const newestId = Number(nextCommitmentId - 1n);
  if (!Number.isSafeInteger(newestId) || newestId <= 0) {
    return {
      address,
      mode: "chain",
      commitments: [],
      scannedCommitments: 0,
      scanLimitReached: false,
    };
  }

  const firstId = Math.max(1, newestId - passportScanLimit + 1);
  const ids = Array.from({ length: newestId - firstId + 1 }, (_, index) => newestId - index);
  const rawResults = await Promise.allSettled(
    ids.map(async (commitmentId) => readRawLiveCommitment(String(commitmentId))),
  );
  const matchingIds = rawResults.flatMap((result) => {
    if (result.status !== "fulfilled") {
      return [];
    }
    return getAddress(result.value.creator) === address ? [result.value.id.toString()] : [];
  });
  const commitments = await Promise.all(
    matchingIds.map(async (commitmentId) => readLiveCommitment(commitmentId)),
  );

  return {
    address,
    mode: "chain",
    commitments: commitments.filter((commitment): commitment is BlockchainCommitment =>
      Boolean(commitment),
    ),
    scannedCommitments: ids.length,
    scanLimitReached: firstId > 1,
  };
}

function seedDemoPassportHistory(address: Address): PromisePassportHistory {
  const seeded =
    address === demoPassportAddress
      ? mockCommitments.map((commitment) => {
          const seededCommitment = seedMockCommitment(commitment.id);
          return {
            ...seededCommitment,
            creator: shortAddress(address),
            creatorAddress: address,
          };
        })
      : [];
  const createdInSession = Array.from(demoCommitments.values()).filter((commitment) => {
    if (commitment.creatorAddress) {
      return getAddress(commitment.creatorAddress) === address;
    }
    return commitment.creator.toLowerCase() === shortAddress(address).toLowerCase();
  });
  const commitments = [...createdInSession, ...seeded]
    .filter(
      (commitment, index, list) =>
        list.findIndex((candidate) => candidate.id === commitment.id) === index,
    )
    .sort((left, right) => Number(right.onChainId ?? 0) - Number(left.onChainId ?? 0));

  return {
    address,
    mode: "demo",
    commitments,
    scannedCommitments: commitments.length,
    scanLimitReached: false,
  };
}

function seedMockCommitment(id: string) {
  const existing = demoCommitments.get(id);
  if (existing) {
    return existing;
  }

  const commitment = getMockCommitment(id);
  const seeded = buildCommitmentView({
    id: commitment.id,
    title: commitment.title,
    description: commitment.description,
    creator: commitment.creator,
    beneficiary: commitment.beneficiary,
    amount: commitment.amount,
    deadline:
      Date.parse(`${commitment.deadlineShort}T00:00:00Z`) / 1000 || Math.floor(Date.now() / 1000),
    evidenceType: commitment.repository,
    evidenceReference: commitment.condition,
    status: commitment.status,
    transactionHash: commitment.transactionHash,
    mode: "demo",
    createdAt: commitment.createdAt,
    lockedAt: commitment.lockedAt,
    submittedAt: commitment.submittedAt,
    resolvedAt: commitment.resolvedAt,
    releaseHash: commitment.releaseHash,
    confirmationStatus: "confirmed",
  });

  demoCommitments.set(id, seeded);
  return seeded;
}

export const blockchainService = {
  async createCommitment(input: CreateCommitmentInput): Promise<PromiseChainActionResult> {
    const amountValue = Number(input.amount.replace(/,/g, ""));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      throw new Error("Escrow amount must be greater than zero");
    }

    if (!isAddress(input.beneficiary)) {
      throw new Error("Beneficiary address is invalid");
    }

    if (!isPromiseChainConfigured()) {
      const commitmentId = `demo-${Date.now().toString(36)}`;
      const commitment = createDemoCommitment(input, commitmentId);
      return {
        commitmentId,
        transactionHash: commitment.transactionHash ?? createDemoHash("demo"),
        commitment,
        mode: "demo",
      };
    }

    const walletClient = await getBrowserWalletClient();
    const accountAddress = walletClient.account.address;
    if (!accountAddress) {
      throw new Error("A connected wallet account is required");
    }

    const publicClient = await getLivePublicClient();
    const contractAddress = requireContractAddress();
    const description = `${input.title}\n\n${input.description}`.trim();
    const deadline = parseDeadline(input.deadline);
    const hash = await writeContract(walletClient, {
      abi: PROMISECHAIN_ABI,
      address: contractAddress,
      functionName: "createCommitment",
      args: [
        getAddress(input.beneficiary),
        BigInt(deadline),
        description,
        input.evidenceType,
        input.evidenceReference,
      ],
      value: parseEther(input.amount.replace(/,/g, "")),
      account: accountAddress,
    });

    const receipt = await waitForTransactionReceipt(publicClient, { hash });
    if (receipt.status !== "success") {
      throw new Error("PromiseChain transaction failed on Sepolia");
    }

    const decodedLogs = parseEventLogs({
      abi: PROMISECHAIN_ABI,
      logs: receipt.logs,
    });
    const createdLog = decodedLogs.find((log) => log.eventName === "CommitmentCreated");
    if (!createdLog || createdLog.args.id === undefined) {
      throw new Error("Unable to read commitment creation event from Sepolia");
    }

    const commitmentId = createdLog.args.id.toString();
    const createdAt = await getBlockTimestampLabel(publicClient, receipt.blockNumber);
    const liveCommitment =
      (await readLiveCommitment(commitmentId)) ??
      buildCommitmentView({
        id: commitmentId,
        title: input.title,
        description,
        creator: shortAddress(accountAddress),
        beneficiary: shortAddress(input.beneficiary),
        amount: Number(input.amount).toLocaleString("en-US", {
          minimumFractionDigits: Number.isInteger(Number(input.amount)) ? 0 : 3,
          maximumFractionDigits: 6,
        }),
        deadline,
        evidenceType: input.evidenceType,
        evidenceReference: input.evidenceReference,
        status: "active",
        transactionHash: hash,
        mode: "chain",
        createdAt,
        lockedAt: createdAt,
        confirmationStatus: "confirmed",
      });

    const hydrated = {
      ...liveCommitment,
      createdAt,
      lockedAt: createdAt,
      transactionHash: hash,
      mode: "chain" as const,
      onChainId: commitmentId,
      contractAddress,
      blockNumber: receipt.blockNumber,
      confirmationStatus: "confirmed" as const,
    };

    chainCommitmentCache.set(commitmentId, hydrated);
    return {
      commitmentId,
      transactionHash: hash,
      commitment: hydrated,
      mode: "chain",
    };
  },

  async getCommitment(id: string): Promise<BlockchainCommitment> {
    const cached = chainCommitmentCache.get(id) ?? demoCommitments.get(id);
    if (cached) {
      return cached;
    }

    if (!isPromiseChainConfigured()) {
      return seedMockCommitment(id);
    }

    if (!/^\d+$/.test(id)) {
      throw new Error("Unable to load commitment from Sepolia");
    }

    const liveCommitment = await readLiveCommitment(id);
    if (!liveCommitment) {
      throw new Error("Unable to load commitment from Sepolia");
    }

    return liveCommitment;
  },

  async getCommitmentsByCreator(address: string): Promise<PromisePassportHistory> {
    if (!isAddress(address)) {
      throw new Error("Enter a valid Ethereum wallet address.");
    }

    const normalizedAddress = getAddress(address);
    if (!isPromiseChainConfigured()) {
      return seedDemoPassportHistory(normalizedAddress);
    }

    return readLivePassportHistory(normalizedAddress);
  },

  async submitEvidence(id: string, evidenceType: string, evidenceReference: string) {
    const existing = await this.getCommitment(id);
    if (existing.mode === "demo" || !isPromiseChainConfigured()) {
      const updated = {
        ...existing,
        evidenceType,
        evidenceReference,
        submittedAt: buildCurrentTimeLabel(),
        condition: `${evidenceType} / ${evidenceReference}`,
        repository: evidenceType,
        mergeStatus: existing.status === "active" ? "open" : existing.mergeStatus,
      };
      demoCommitments.set(id, updated);
      return updated;
    }

    const walletClient = await getBrowserWalletClient();
    const accountAddress = walletClient.account.address;
    if (!accountAddress) {
      throw new Error("A connected wallet account is required");
    }

    const publicClient = await getLivePublicClient();
    const contractAddress = requireContractAddress();
    const hash = await writeContract(walletClient, {
      abi: PROMISECHAIN_ABI,
      address: contractAddress,
      functionName: "submitEvidence",
      args: [BigInt(id), evidenceType, evidenceReference],
      account: accountAddress,
    });

    const receipt = await waitForTransactionReceipt(publicClient, { hash });
    if (receipt.status !== "success") {
      throw new Error("PromiseChain transaction failed on Sepolia");
    }

    const updated = {
      ...existing,
      evidenceType,
      evidenceReference,
      submittedAt: await getBlockTimestampLabel(publicClient, receipt.blockNumber),
      evidenceHash: hash,
      condition: `${evidenceType} / ${evidenceReference}`,
      repository: evidenceType,
      confirmationStatus: "confirmed" as const,
    };
    chainCommitmentCache.set(id, updated);
    return updated;
  },

  async resolveCommitment(id: string, success: boolean) {
    const existing = await this.getCommitment(id);
    if (existing.mode === "demo" || !isPromiseChainConfigured()) {
      const updated = resolveDemoCommitment(id, success, existing.repository, existing.condition);
      demoCommitments.set(id, updated);
      return updated;
    }

    const walletClient = await getBrowserWalletClient();
    const accountAddress = walletClient.account.address;
    if (!accountAddress) {
      throw new Error("A connected wallet account is required");
    }

    const publicClient = await getLivePublicClient();
    const contractAddress = requireContractAddress();
    const hash = await writeContract(walletClient, {
      abi: PROMISECHAIN_ABI,
      address: contractAddress,
      functionName: "resolveCommitment",
      args: [BigInt(id), success],
      account: accountAddress,
    });

    const receipt = await waitForTransactionReceipt(publicClient, { hash });
    if (receipt.status !== "success") {
      throw new Error("PromiseChain transaction failed on Sepolia");
    }

    const updated = {
      ...existing,
      status: success ? ("completed" as const) : ("failed" as const),
      resolvedAt: await getBlockTimestampLabel(publicClient, receipt.blockNumber),
      verifiedAt: existing.verifiedAt,
      releaseHash: hash,
      progress: success ? 100 : 0,
      mergeStatus: success ? ("merged" as const) : ("not-submitted" as const),
      mergeDate: existing.mergeDate,
      confirmationStatus: "confirmed" as const,
    };
    chainCommitmentCache.set(id, updated);
    return updated;
  },

  async getTransaction(hash: string): Promise<PromiseChainTransactionInfo> {
    if (!isPromiseChainConfigured()) {
      return {
        hash,
        network: "Demo mode",
        status: "confirmed",
        block: "demo",
        confirmationStatus: "confirmed",
      };
    }

    const publicClient = await getLivePublicClient();
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: hash as `0x${string}` });
      const confirmationStatus =
        receipt.status === "success"
          ? "confirmed"
          : receipt.status === "reverted"
            ? "reverted"
            : "pending";
      return {
        hash,
        network: "sepolia",
        status: confirmationStatus,
        block: receipt.blockNumber.toString(),
        blockNumber: receipt.blockNumber.toString(),
        confirmationStatus,
      };
    } catch {
      throw new Error("Unable to load transaction from Sepolia");
    }
  },
};
