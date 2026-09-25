import { useMemo } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, Check, CircleAlert, CircleX, Clock3, Wallet } from "lucide-react";
import { useAccount } from "wagmi";

import { EmptyState, SectionEyebrow, Shell, StatCard, StatusBadge } from "@/components/commitchain";
import { blockchainService, toCommitmentView } from "@/services/blockchain";
import { buildPromiseRecord } from "@/services/promiseRecord";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile Reputation - PromiseChain" },
      {
        name: "description",
        content: "Inspect your public commitment history and delivery record.",
      },
      { property: "og:title", content: "Profile Reputation - PromiseChain" },
      {
        property: "og:description",
        content: "Inspect your public commitment history and delivery record.",
      },
    ],
  }),
  component: Profile,
});

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

function Profile() {
  const { address, isConnected } = useAccount();

  const {
    data: history,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["profile-commitments", address],
    enabled: isConnected && Boolean(address),
    queryFn: () => blockchainService.getCommitmentsByCreator(address ?? ""),
  });

  const rawCommitments = useMemo(() => history?.commitments ?? [], [history?.commitments]);
  const mappedCommitments = useMemo(
    () => rawCommitments.map((c) => toCommitmentView(c)),
    [rawCommitments],
  );

  const promiseRecord = buildPromiseRecord(rawCommitments);

  const totalFundsEth = useMemo(() => {
    return mappedCommitments.reduce((sum, item) => {
      const parsed = parseFloat(item.amount.replace(/,/g, ""));
      return sum + (Number.isNaN(parsed) ? 0 : parsed);
    }, 0);
  }, [mappedCommitments]);

  return (
    <Shell>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Dashboard
        </Link>

        <section className="mt-10 grid gap-10 border-b border-rule pb-12 lg:grid-cols-[1fr_360px] lg:items-end">
          <div>
            <SectionEyebrow>Public wallet profile</SectionEyebrow>
            <div className="mt-5 flex items-center gap-4">
              <div className="grid size-14 place-items-center bg-ink text-xl font-bold text-lime">
                {address ? address.slice(2, 4).toUpperCase() : "PC"}
              </div>
              <div>
                <h1 className="text-4xl font-bold tracking-tight">Promise Passport</h1>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {address ? shortAddress(address) : "Not connected"}
                </p>
              </div>
            </div>
            <p className="mt-6 max-w-xl text-sm leading-6 text-muted-foreground">
              A verifiable history of promises made, evidence submitted, and value delivered.
            </p>
          </div>
          <div className="border-l-2 border-lime pl-5">
            <p className="font-mono text-[10px] uppercase tracking-[.14em] text-faint">
              Completion rate
            </p>
            {promiseRecord.fulfillment ? (
              <>
                <p className="mt-1 text-5xl font-bold">
                  {promiseRecord.fulfillment.percentage}
                  <span className="text-2xl text-muted-foreground">%</span>
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {promiseRecord.fulfillment.successful} of {promiseRecord.fulfillment.resolved}{" "}
                  resolved commitments delivered
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm font-semibold text-muted-foreground">
                No resolved commitments yet
              </p>
            )}
          </div>
        </section>

        {history?.mode === "demo" && (
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Demo mode is showing local sample commitments for the demo creator wallet. Live profile
            records load from Sepolia when the contract is configured.
          </p>
        )}

        {history?.scanLimitReached && (
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The latest {history.scannedCommitments} commitments were scanned from the contract for
            this MVP view.
          </p>
        )}

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total" value={padZero(promiseRecord.totalCommitments)} />
          <StatCard
            label="Completed"
            value={padZero(promiseRecord.successfulCommitments)}
            tone="accent"
          />
          <StatCard label="Active" value={padZero(promiseRecord.activeCommitments)} />
          <StatCard label="Failed" value={padZero(promiseRecord.failedCommitments)} tone="danger" />
          <StatCard
            label="Value committed"
            value={`${totalFundsEth.toLocaleString("en-US", { maximumFractionDigits: 4 })} ETH`}
            detail="lifetime"
          />
        </div>

        {!isConnected && (
          <section className="mt-10 border border-rule bg-panel p-8">
            <div className="flex items-start gap-3">
              <Wallet className="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <h2 className="font-bold">Wallet not connected</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Connect your wallet using the navbar button to view your reputation record.
                </p>
              </div>
            </div>
          </section>
        )}

        {isConnected && isLoading && (
          <section className="mt-10 border border-rule bg-panel p-8 text-sm text-muted-foreground">
            Loading reputation history...
          </section>
        )}

        {isConnected && error && (
          <section className="mt-10 border border-rule bg-panel p-8">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 text-danger" />
              <div>
                <h2 className="font-bold">Unable to load reputation profile</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {error instanceof Error
                    ? error.message
                    : "Unable to load commitments from Sepolia."}
                </p>
              </div>
            </div>
          </section>
        )}

        {isConnected && history && mappedCommitments.length === 0 && (
          <section className="mt-10">
            <EmptyState
              title="No commitments yet"
              description="You have not created any PromiseChain commitments with this wallet."
            />
          </section>
        )}

        {isConnected && history && mappedCommitments.length > 0 && (
          <>
            <section className="mt-14">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <SectionEyebrow>Reputation / history</SectionEyebrow>
                  <h2 className="mt-3 text-3xl font-bold tracking-tight">The paper trail.</h2>
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[.14em] text-faint">
                  {mappedCommitments.length} records
                </span>
              </div>
              <div className="mt-6 grid gap-3">
                {mappedCommitments.map((commitment) => (
                  <div
                    key={commitment.id}
                    className="grid gap-4 border border-rule bg-panel p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={commitment.status} />
                        <span className="font-mono text-[10px] text-faint">
                          {commitment.reference}
                        </span>
                      </div>
                      <h3 className="mt-3 font-bold">{commitment.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{commitment.condition}</p>
                    </div>
                    <div className="sm:text-right">
                      <p className="font-mono text-lg font-bold">
                        {commitment.amount} {commitment.token}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {commitment.deadlineShort}
                      </p>
                    </div>
                    <Link
                      to="/commitments/$id"
                      params={{ id: commitment.id }}
                      className="inline-flex items-center gap-1 text-xs font-bold text-lime-soft"
                    >
                      Inspect <ArrowUpRight className="size-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </section>
            <section className="mt-14 border-t border-rule pt-10">
              <div className="grid gap-6 sm:grid-cols-3">
                {[
                  {
                    label: "Delivered",
                    value: String(promiseRecord.successfulCommitments),
                    Icon: Check,
                  },
                  {
                    label: "In progress",
                    value: String(promiseRecord.activeCommitments),
                    Icon: Clock3,
                  },
                  {
                    label: "Missed",
                    value: String(promiseRecord.failedCommitments),
                    Icon: CircleX,
                  },
                ].map(({ label, value, Icon }) => (
                  <div key={label} className="flex items-center gap-3">
                    <Icon className="size-4 text-lime-soft" />
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="font-mono text-xl font-bold">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </Shell>
  );
}
