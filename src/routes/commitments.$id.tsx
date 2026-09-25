import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DetailHeader,
  EvidencePanel,
  SectionEyebrow,
  Shell,
  Timeline,
  TransactionRow,
} from "@/components/commitchain";
import { blockchainService, toCommitmentView } from "@/services/blockchain";
import { getCommitment as getMockCommitment } from "@/services/mockData";

function baseScanTxUrl(hash?: string) {
  return hash ? `https://sepolia.etherscan.io/tx/${hash}` : undefined;
}

export const Route = createFileRoute("/commitments/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `${getMockCommitment(params.id).title} - PromiseChain` },
      {
        name: "description",
        content: "Inspect the evidence, timeline, and escrow state for this commitment.",
      },
      { property: "og:title", content: `${getMockCommitment(params.id).title} - PromiseChain` },
      {
        property: "og:description",
        content: "Inspect the evidence, timeline, and escrow state for this commitment.",
      },
    ],
  }),
  component: CommitmentDetails,
});

function CommitmentDetails() {
  const { id } = Route.useParams();
  const {
    data: commitment,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["commitment", id],
    queryFn: () => blockchainService.getCommitment(id),
  });

  const displayCommitment = commitment ? toCommitmentView(commitment) : undefined;
  const errorMessage =
    error instanceof Error ? error.message : "Unable to load commitment from Sepolia.";

  if (isLoading || !commitment || !displayCommitment) {
    if (error) {
      return (
        <Shell>
          <main className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="border border-rule bg-panel p-8 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">
                Unable to load commitment from Sepolia
              </p>
              <p className="mt-2">{errorMessage}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.14em] text-faint">
                Demo mode remains available when the blockchain is not configured.
              </p>
            </div>
          </main>
        </Shell>
      );
    }

    return (
      <Shell>
        <main className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="border border-rule bg-panel p-8 text-sm text-muted-foreground">
            Loading commitment record...
          </div>
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      <DetailHeader commitment={displayCommitment} />
      <main className="mx-auto grid max-w-6xl gap-12 px-5 py-10 sm:px-8 sm:py-14 lg:grid-cols-[1fr_340px] lg:gap-16">
        <div className="space-y-10">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> All commitments
          </Link>
          <EvidencePanel
            commitment={displayCommitment}
            verified={commitment.status === "completed"}
          />
          <Timeline commitment={displayCommitment} />
        </div>
        <aside className="space-y-8">
          <section>
            <SectionEyebrow>People</SectionEyebrow>
            <div className="mt-4 divide-y divide-rule border-y border-rule">
              <div className="py-4">
                <p className="text-xs text-muted-foreground">Creator</p>
                <p className="mt-1 font-mono text-sm font-semibold">{commitment.creator}</p>
                <p className="mt-1 text-xs text-muted-foreground">Project Alpha</p>
              </div>
              <div className="py-4">
                <p className="text-xs text-muted-foreground">Beneficiary</p>
                <p className="mt-1 font-mono text-sm font-semibold">{commitment.beneficiary}</p>
                <p className="mt-1 text-xs text-muted-foreground">{commitment.beneficiaryLabel}</p>
              </div>
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between">
              <SectionEyebrow>Transactions</SectionEyebrow>
              <span className="font-mono text-[10px] text-faint">
                {commitment.mode === "chain" ? "Sepolia" : "Demo mode"}
              </span>
            </div>
            <div className="mt-3 border-y border-rule">
              <TransactionRow
                label="Creation transaction"
                hash={
                  commitment.mode === "chain"
                    ? (commitment.transactionHash ?? "Unavailable")
                    : "Unavailable"
                }
                href={
                  commitment.mode === "chain"
                    ? baseScanTxUrl(commitment.transactionHash)
                    : undefined
                }
              />
              {commitment.evidenceHash && (
                <TransactionRow
                  label="Evidence submission"
                  hash={commitment.evidenceHash}
                  href={
                    commitment.mode === "chain" ? baseScanTxUrl(commitment.evidenceHash) : undefined
                  }
                />
              )}
              {commitment.releaseHash && (
                <TransactionRow
                  label="Settlement transaction"
                  hash={commitment.mode === "chain" ? commitment.releaseHash : "Unavailable"}
                  href={
                    commitment.mode === "chain" ? baseScanTxUrl(commitment.releaseHash) : undefined
                  }
                />
              )}
            </div>
          </section>
          <section className="border border-rule bg-panel p-5">
            <p className="font-mono text-[10px] uppercase tracking-[.14em] text-faint">
              Next action
            </p>
            <h2 className="mt-3 text-lg font-bold">
              {commitment.status === "active" ? "Ready to resolve?" : "See the outcome"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {commitment.status === "active"
                ? "Review the stored evidence metadata and preview how this commitment resolves."
                : "Review the final evidence and escrow outcome."}
            </p>
            <Button
              asChild
              variant={commitment.status === "failed" ? "danger" : "accent"}
              className="mt-5 w-full"
            >
              <Link to="/resolution/$id" params={{ id: commitment.id }}>
                {commitment.status === "active" ? "Open resolution preview" : "View resolution"}{" "}
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </section>
        </aside>
      </main>
    </Shell>
  );
}
