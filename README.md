# PromiseChain

PromiseChain is an accountability app for funded commitments. A creator defines a promise, locks ETH in escrow, names a beneficiary, sets a deadline, and specifies GitHub evidence that can be checked before an authorized resolver settles the commitment.

The current MVP runs against the Sepolia network when contract environment variables are configured, and falls back to demo data when they are not.

## What PromiseChain Does

- Creates funded commitments with an on-chain escrow amount, beneficiary, deadline, and evidence reference.
- Lets the authorized resolver submit evidence and resolve escrow as successful or failed.
- Verifies supported GitHub evidence through a server-side boundary before enabling success resolution in the UI.
- Shows public commitment history through the Promise Passport.
- Derives a transparent Promise Record from wallet-scoped commitment history.

The Promise Record is not an objective reputation score. It is a transparent summary of the underlying commitments: total commitments, successful commitments, failed commitments, active commitments, fulfillment over resolved commitments, and verified evidence when genuine verification data is available.

## Core Flow

1. A creator opens the app and creates a commitment.
2. The Solidity contract locks ETH escrow on Sepolia.
3. The commitment stores the creator, beneficiary, amount, deadline, description, evidence type, and evidence reference.
4. The resolver reviews the evidence.
5. GitHub evidence is externally verified through a server-side verification boundary, while the authorized resolver remains responsible for submitting evidence and resolving escrow on-chain.
6. If resolved successfully, escrow is released to the beneficiary.
7. If resolved as failed after the deadline, escrow is returned to the creator.
8. Public pages display the commitment outcome and derived wallet-scoped Passport metrics.

## Architecture

- `contracts/PromiseChain.sol`: Solidity escrow contract.
- `src/services/blockchain.ts`: frontend service boundary for demo mode and epolia contract reads/writes.
- `src/services/evidence.ts`: GitHub evidence validation and verification logic.
- `src/services/evidenceVerification.ts`: server-side verification boundary for GitHub access.
- `src/services/promiseRecord.ts`: derived Promise Record metrics.
- `src/routes/passport.$address.tsx`: public Promise Passport and Promise Record UI.
- `src/routes/resolution.$id.tsx`: resolver workflow and GitHub verification UI.

PromiseChain is not described as fully decentralized in this MVP. GitHub verification is performed off-chain through the server-side boundary and is not permanently stored on-chain by the current contract.

## Contract Model

The Solidity contract supports:

- creating ETH-backed commitments;
- submitting evidence metadata;
- resolving a commitment as successful or failed;
- releasing funds to the beneficiary on success;
- refunding the creator on failure;
- owner-managed resolver authorization.

The resolver is the only account allowed to submit evidence and resolve commitments on-chain. The contract remains the source of truth for escrow state and commitment outcome.

## GitHub Evidence Verification

Supported evidence references include:

- merged pull requests;
- closed issues;
- commits reachable from a branch.

Verification checks are performed server-side so GitHub credentials do not cross into browser code. Evidence submission is separate from evidence verification, and evidence verification is separate from final escrow outcome.

## Promise Passport

The Promise Passport is a public wallet-scoped view of commitments created through PromiseChain. It aggregates existing commitment history and does not link wallets to emails, social identities, ENS names, or user accounts.

## Promise Record

The Promise Record is derived from Passport commitments:

- Total commitments;
- Successful commitments;
- Failed commitments;
- Active commitments;
- Fulfillment percentage, calculated as `successful / (successful + failed)`;
- Verified Evidence, counted only when genuine verification data exists on successful commitments.

Active and evidence-submitted commitments are excluded from the fulfillment denominator. ETH amount does not weight or alter the Promise Record.

## Environment Setup

Create a local `.env` file when running against Sepolia:

```sh
VITE_PROMISECHAIN_CONTRACT_ADDRESS=0x...
VITE_SEPOLIA_RPC_URL=https://...
GITHUB_TOKEN=github_pat_or_token
```

The app can run without these variables in demo mode. Demo mode uses local sample data and does not claim live transactions or durable GitHub verification.

## Development

```sh
npm install
npm run dev
```

## Testing

```sh
npx.cmd tsc --noEmit
npm.cmd run build
npx.cmd eslint .
npm.cmd run hardhat:test
npm.cmd run test:evidence
npm.cmd run test:promise-record
```

## Deployment

Compile the contract before deployment:

```sh
npm.cmd run hardhat:compile
```

Deployments target Sepolia through the configured Hardhat network:

```sh
npm.cmd run hardhat:deploy:sepolia
```

After deployment, set `VITE_PROMISECHAIN_CONTRACT_ADDRESS` to the deployed contract address and provide a Sepolia RPC URL.

## Known MVP Limitations

- Passport live history scans recent on-chain commitments rather than using an external indexer.
- GitHub verification results are checked off-chain and are not permanently stored on-chain by the current contract.
- The authorized resolver model is centralized to the configured resolver account.
- Demo mode uses local sample commitments.
- No database, subgraph, oracle, account system, or identity linking is included.
- Promise Record metrics are transparent derived summaries, not a trust score, ranking, or weighted reputation system.
