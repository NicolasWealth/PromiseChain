import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, CircleAlert, FileText, Github } from "lucide-react";
import { getAddress, isAddress } from "viem";

import { EmptyState, SectionEyebrow, Shell } from "@/components/commitchain";
import { blockchainService, type BlockchainCommitment } from "@/services/blockchain";
import { describeEvidenceReference } from "@/services/evidenceShared";
import { buildPromiseRecord, type PromiseRecordMetrics } from "@/services/promiseRecord";

type PassportStatus = "Active" | "Evidence Submitted" | "Successful" | "Failed";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function passportStatus(commitment: BlockchainCommitment): {
  label: PassportStatus;
  detail: string;
  className: string;
} {
  if (commitment.status === "completed") {
    return {
      label: "Successful",
      detail: "Commitment was resolved successfully and escrow was released.",
      className: "bg-lime/20 text-lime-soft",
    };
  }

  if (commitment.status === "failed") {
    return {
      label: "Failed",
      detail: "Commitment was resolved as failed and escrow was returned to the creator.",
      className: "bg-danger-soft text-danger",
    };
  }

  if (commitment.submittedAt) {
    return {
      label: "Evidence Submitted",
      detail: "Evidence has been submitted but the commitment has not yet been resolved.",
      className: "bg-ink/10 text-foreground",
    };
  }

  return {
    label: "Active",
    detail: "Promise is still open.",
    className: "bg-lime text-ink",
  };
}

function countLabel(total: number, successful: number, failed: number, active: number) {
  return `${total} commitments / ${successful} successful / ${failed} failed / ${active} active`;
}

export const Route = createFileRoute("/passport/$address")({
  head: ({ params }) => ({
    meta: [
      { title: `Promise Passport - ${params.address}` },
      {
        name: "description",
        content: "Inspect a wallet's public PromiseChain commitment history.",
      },
      { property: "og:title", content: `Promise Passport - ${params.address}` },
      {
        property: "og:description",
        content: "Inspect a wallet's public PromiseChain commitment history.",
      },
    ],
  }),
  component: PromisePassport,
});

function PromisePassport() {
  const { address } = Route.useParams();
  const validAddress = isAddress(address);
  const normalizedAddress = validAddress ? getAddress(address) : undefined;

  const {
    data: history,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["promise-passport", normalizedAddress],
    enabled: Boolean(normalizedAddress),
    queryFn: () => blockchainService.getCommitmentsByCreator(normalizedAddress ?? ""),
  });

  const commitments = history?.commitments ?? [];
  const promiseRecord = buildPromiseRecord(commitments);

  return (
    <Shell>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Dashboard
        </Link>

        <section className="mt-10 border-b border-rule pb-10">
          <SectionEyebrow>Public accountability record</SectionEyebrow>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Promise Passport</h1>
              <p className="mt-3 font-mono text-sm text-muted-foreground">
                {validAddress && normalizedAddress ? shortAddress(normalizedAddress) : address}
              </p>
            </div>
            {history && (
              <div className="border-l-2 border-lime pl-5">
                <p className="font-mono text-[10px] uppercase tracking-[.14em] text-faint">
                  On-chain summary
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {countLabel(
                    promiseRecord.totalCommitments,
                    promiseRecord.successfulCommitments,
                    promiseRecord.failedCommitments,
                    promiseRecord.activeCommitments,
                  )}
                </p>
              </div>
            )}
          </div>
          {history?.mode === "demo" && (
            <p className="mt-5 max-w-2xl text-xs leading-5 text-muted-foreground">
              Demo mode is showing local sample commitments for the demo creator wallet. Live
              Passport records load from Base Sepolia when the contract is configured.
            </p>
          )}
          {history?.scanLimitReached && (
            <p className="mt-5 max-w-2xl text-xs leading-5 text-muted-foreground">
              The latest {history.scannedCommitments} commitments were scanned from the contract for
              this MVP view.
            </p>
          )}
        </section>

        {!validAddress && (
          <section className="mt-10 border border-rule bg-panel p-8">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 text-danger" />
              <div>
                <h2 className="font-bold">Invalid wallet address</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Enter a valid Ethereum address to view a Promise Passport.
                </p>
              </div>
            </div>
          </section>
        )}

        {validAddress && isLoading && (
          <section className="mt-10 border border-rule bg-panel p-8 text-sm text-muted-foreground">
            Loading Passport commitments...
          </section>
        )}

        {validAddress && error && (
          <section className="mt-10 border border-rule bg-panel p-8">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 text-danger" />
              <div>
                <h2 className="font-bold">Unable to load Passport</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {error instanceof Error
                    ? error.message
                    : "Unable to load commitments from Base Sepolia."}
                </p>
              </div>
            </div>
          </section>
        )}

        {validAddress && history && commitments.length === 0 && (
          <section className="mt-10">
            <EmptyState
              title="No commitments yet"
              description="This wallet has not created any PromiseChain commitments yet."
            />
          </section>
        )}

        {validAddress && commitments.length > 0 && (
          <>
            <PromiseRecordSection record={promiseRecord} />
            <section className="mt-10">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <SectionEyebrow>Commitment history</SectionEyebrow>
                  <h2 className="mt-3 text-3xl font-bold tracking-tight">Promises made.</h2>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[.14em] text-faint">
                  Newest first
                </span>
              </div>
              <div className="mt-6 grid gap-4">
                {commitments.map((commitment) => (
                  <PassportCommitmentCard key={commitment.id} commitment={commitment} />
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </Shell>
  );
}

function PromiseRecordSection({ record }: { record: PromiseRecordMetrics }) {
  const stats = [
    { value: record.totalCommitments, label: "Total commitments" },
    { value: record.successfulCommitments, label: "Successful" },
    { value: record.failedCommitments, label: "Failed" },
    { value: record.activeCommitments, label: "Active" },
  ];

  return (
    <section className="mt-10 border border-rule bg-panel p-5 sm:p-6">
      <SectionEyebrow>Promise Record</SectionEyebrow>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="border border-rule bg-background/40 p-4">
            <p className="text-3xl font-bold tracking-tight">{stat.value}</p>
            <p className="mt-1 text-xs font-semibold text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-5 border-t border-rule pt-5 md:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
            Fulfillment
          </p>
          {record.fulfillment ? (
            <>
              <p className="mt-2 text-3xl font-bold tracking-tight">
                {record.fulfillment.percentage}% fulfillment
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {record.fulfillment.successful} / {record.fulfillment.resolved} resolved commitments
                successful
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold text-muted-foreground">
              No resolved commitments yet
            </p>
          )}
        </div>

        {record.verifiedEvidence && (
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              Verified Evidence
            </p>
            <p className="mt-2 text-3xl font-bold tracking-tight">
              {record.verifiedEvidence.verified} / {record.verifiedEvidence.successful}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">successful commitments</p>
          </div>
        )}
      </div>
    </section>
  );
}

function PassportCommitmentCard({ commitment }: { commitment: BlockchainCommitment }) {
  const status = passportStatus(commitment);
  const evidence = describeEvidenceReference(commitment.evidenceType, commitment.evidenceReference);
  const beneficiary = commitment.beneficiaryAddress
    ? shortAddress(getAddress(commitment.beneficiaryAddress))
    : commitment.beneficiary;

  return (
    <article className="border border-rule bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${status.className}`}
        >
          {status.label}
        </span>
        <span className="font-mono text-[11px] text-faint">{commitment.reference}</span>
        <Link
          to="/commitments/$id"
          params={{ id: commitment.id }}
          className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-lime-soft"
        >
          Inspect <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">Promise</p>
          <h3 className="mt-2 text-xl font-bold tracking-tight">{commitment.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{commitment.description}</p>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">{status.detail}</p>
        </div>

        <div className="grid gap-4 text-sm">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">ON-CHAIN</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="mt-1 font-mono font-bold">{commitment.amount} ETH</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Deadline</p>
                <p className="mt-1 font-semibold">{commitment.deadline}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Beneficiary</p>
                <p className="mt-1 font-mono font-semibold">{beneficiary}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Commitment ID</p>
                <p className="mt-1 font-mono font-semibold">
                  {commitment.onChainId ?? commitment.id}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-rule pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">GITHUB</p>
            <div className="mt-3 flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center bg-ink text-lime">
                {evidence.githubUrl ? (
                  <Github className="size-4" />
                ) : (
                  <FileText className="size-4" />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Evidence</p>
                <p className="mt-1 font-semibold">{evidence.label}</p>
                <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                  {evidence.repository !== "Unavailable" ? evidence.repository : evidence.primary}
                </p>
                {evidence.repository !== "Unavailable" && (
                  <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                    {evidence.primary}
                    {evidence.secondary ? ` / ${evidence.secondary}` : ""}
                  </p>
                )}
                {commitment.verifiedAt && (
                  <p className="mt-2 text-xs font-semibold text-lime-soft">Evidence verified</p>
                )}
                {evidence.githubUrl && (
                  <a
                    href={evidence.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-lime-soft"
                  >
                    Open evidence <ArrowUpRight className="size-3.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
