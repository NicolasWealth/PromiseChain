import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, SlidersHorizontal, CircleAlert, Wallet } from "lucide-react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  CommitmentCard,
  EmptyState,
  SectionEyebrow,
  Shell,
  StatCard,
} from "@/components/commitchain";
import { blockchainService, toCommitmentView } from "@/services/blockchain";
import type { CommitmentStatus } from "@/services/mockData";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard - PromiseChain" },
      { name: "description", content: "Review active, completed, and failed commitments." },
      { property: "og:title", content: "Dashboard - PromiseChain" },
      { property: "og:description", content: "Review active, completed, and failed commitments." },
    ],
  }),
  component: Dashboard,
});

function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

function Dashboard() {
  const [filter, setFilter] = useState<"all" | CommitmentStatus>("all");
  const { address, isConnected } = useAccount();

  const {
    data: history,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["dashboard-commitments", address],
    enabled: isConnected && Boolean(address),
    queryFn: () => blockchainService.getCommitmentsByCreator(address ?? ""),
  });

  const mappedCommitments = useMemo(
    () => (history?.commitments ?? []).map((c) => toCommitmentView(c)),
    [history?.commitments],
  );

  const totalCount = mappedCommitments.length;
  const activeCount = mappedCommitments.filter((item) => item.status === "active").length;
  const completedCount = mappedCommitments.filter((item) => item.status === "completed").length;
  const failedCount = mappedCommitments.filter((item) => item.status === "failed").length;

  const totalFundsEth = useMemo(() => {
    return mappedCommitments.reduce((sum, item) => {
      const parsed = parseFloat(item.amount.replace(/,/g, ""));
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
  }, [mappedCommitments]);

  const filtered =
    filter === "all"
      ? mappedCommitments
      : mappedCommitments.filter((item) => item.status === filter);

  return (
    <Shell>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <SectionEyebrow>Workspace / overview</SectionEyebrow>
            <h1 className="mt-3 text-4xl font-bold tracking-tight">Your commitments</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              A single view of every promise, deadline, and outcome.
            </p>
          </div>
          <Button asChild variant="accent">
            <Link to="/create">
              <Plus className="size-4" /> Create commitment
            </Link>
          </Button>
        </div>

        {history?.mode === "demo" && (
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Demo mode is showing local sample commitments for the demo creator wallet. Live
            Dashboard records load from Sepolia when the contract is configured.
          </p>
        )}

        {history?.scanLimitReached && (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The latest {history.scannedCommitments} commitments were scanned from the contract for
            this MVP view.
          </p>
        )}

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard label="Total commitments" value={padZero(totalCount)} detail="all time" />
          <StatCard
            label="Active"
            value={padZero(activeCount)}
            detail="in progress"
            tone="accent"
          />
          <StatCard label="Completed" value={padZero(completedCount)} detail="delivered" />
          <StatCard
            label="Failed"
            value={padZero(failedCount)}
            detail="deadline missed"
            tone="danger"
          />
          <StatCard
            label="Funds committed"
            value={`${totalFundsEth.toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH`}
            detail="on-chain escrow"
          />
        </div>

        {!isConnected && (
          <section className="mt-10 border border-rule bg-panel p-8">
            <div className="flex items-start gap-3">
              <Wallet className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <h2 className="font-bold">Wallet not connected</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Connect your wallet using the navbar button to view your Sepolia commitments.
                </p>
              </div>
            </div>
          </section>
        )}

        {isConnected && isLoading && (
          <section className="mt-10 border border-rule bg-panel p-8 text-sm text-muted-foreground">
            Loading dashboard commitments...
          </section>
        )}

        {isConnected && error && (
          <section className="mt-10 border border-rule bg-panel p-8">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 text-danger" />
              <div>
                <h2 className="font-bold">Unable to load dashboard commitments</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {error instanceof Error
                    ? error.message
                    : "Unable to load commitments from Sepolia."}
                </p>
              </div>
            </div>
          </section>
        )}

        {isConnected && history && (
          <>
            <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-3">
              <div className="flex flex-wrap gap-1">
                {(["all", "active", "completed", "failed"] as const).map((item) => (
                  <Button
                    key={item}
                    variant={filter === item ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => setFilter(item)}
                  >
                    {item.charAt(0).toUpperCase() + item.slice(1)}
                  </Button>
                ))}
              </div>
              <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.14em] text-faint">
                <SlidersHorizontal className="size-3.5" /> {filtered.length} records
              </span>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {filtered.length ? (
                filtered.map((commitment) => (
                  <CommitmentCard key={commitment.id} commitment={commitment} />
                ))
              ) : (
                <div className="lg:col-span-2">
                  <EmptyState
                    title="No commitments here"
                    description="Try a different filter to see more of the paper trail."
                  />
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </Shell>
  );
}
