import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, CircleX, ExternalLink, LoaderCircle, ShieldCheck } from "lucide-react";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  EvidencePanel,
  SectionEyebrow,
  Shell,
  StatusBadge,
  TransactionRow,
} from "@/components/commitchain";
import { blockchainService, toCommitmentView } from "@/services/blockchain";
import {
  EvidenceValidationError,
  createDemoVerificationResult,
  type VerificationResult,
} from "@/services/evidenceShared";
import { verifyEvidenceOnServer } from "@/services/evidenceVerification";
import { getCommitment as getMockCommitment } from "@/services/mockData";

const evidenceLabels: Record<string, string> = {
  PR_MERGED: "PR merged",
  ISSUE_CLOSED: "Issue closed",
  COMMIT_ON_BRANCH: "Commit on branch",
};

const statusLabels: Record<VerificationResult["status"], string> = {
  verified: "Verified on GitHub",
  failed: "Not verified",
  not_found: "Evidence not found",
  error: "GitHub unavailable",
  unsupported: "Unsupported evidence",
  deadline_uncertain: "Deadline uncertain",
  demo: "Demo evidence",
};

function deadlineEndOfDay(deadline: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return `${deadline}T23:59:59Z`;
  }

  const timestamp = Date.parse(`${deadline} 23:59:59 UTC`);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : deadline;
}

function isDeadlinePassed(deadline: string) {
  const parsed = Date.parse(deadlineEndOfDay(deadline));
  return Number.isFinite(parsed) ? parsed <= Date.now() : false;
}

export const Route = createFileRoute("/resolution/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Resolution - ${getMockCommitment(params.id).title}` },
      {
        name: "description",
        content: "See how this commitment resolved and what happened to the escrow.",
      },
      { property: "og:title", content: `Resolution - ${getMockCommitment(params.id).title}` },
      {
        property: "og:description",
        content: "See how this commitment resolved and what happened to the escrow.",
      },
    ],
  }),
  component: Resolution,
});

function Resolution() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const verifyEvidenceServer = useServerFn(verifyEvidenceOnServer);
  const {
    data: commitment,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["commitment", id],
    queryFn: () => blockchainService.getCommitment(id),
  });
  const verificationQuery = useQuery({
    queryKey: [
      "evidence-verification",
      id,
      commitment?.evidenceType,
      commitment?.evidenceReference,
      commitment?.deadline,
      commitment?.mode,
    ],
    enabled: Boolean(commitment?.evidenceReference),
    retry: false,
    queryFn: async () => {
      if (!commitment) {
        throw new Error("Commitment is not loaded.");
      }

      if (commitment.mode === "demo" && !commitment.evidenceReference.startsWith("github:")) {
        return createDemoVerificationResult(toCommitmentView(commitment));
      }

      return verifyEvidenceServer({
        data: {
          reference: commitment.evidenceReference,
          deadline: deadlineEndOfDay(commitment.deadline),
        },
      });
    },
  });

  const [pendingAction, setPendingAction] = useState<"evidence" | "success" | "failure" | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");

  if (isLoading || !commitment) {
    if (error) {
      return (
        <Shell>
          <main className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
            <div className="border border-rule bg-panel p-8 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">
                Unable to load commitment from Base Sepolia
              </p>
              <p className="mt-2">
                {error instanceof Error
                  ? error.message
                  : "Unable to load commitment from Base Sepolia."}
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
            Loading resolution record...
          </div>
        </main>
      </Shell>
    );
  }

  const currentCommitment = commitment;
  const displayCommitment = toCommitmentView(currentCommitment);
  const verificationResult = verificationQuery.data;
  const evidenceLabel =
    evidenceLabels[currentCommitment.evidenceType] ??
    currentCommitment.evidenceType ??
    "GitHub evidence";
  const verificationStatus =
    verificationResult?.status ??
    (verificationQuery.error instanceof EvidenceValidationError ? "unsupported" : undefined);
  const verificationLabel = verificationStatus
    ? statusLabels[verificationStatus]
    : verificationQuery.isFetching
      ? "Checking GitHub"
      : "Awaiting verification";
  const authorized =
    currentCommitment.mode === "demo"
      ? isConnected
      : Boolean(
          address &&
          currentCommitment.resolver &&
          address.toLowerCase() === currentCommitment.resolver.toLowerCase(),
        );
  const deadlinePassed = isDeadlinePassed(currentCommitment.deadline);
  const canFail =
    currentCommitment.status === "active" && (deadlinePassed || currentCommitment.mode === "demo");
  const canResolve = currentCommitment.status === "active" && authorized;
  const canMarkSuccess = canResolve && Boolean(verificationResult?.verified);

  async function runAction(action: "evidence" | "success" | "failure") {
    if (!authorized) {
      setErrorMessage("Connect the authorized resolver wallet to continue.");
      return;
    }
    if (action === "success" && !verificationResult?.verified) {
      setErrorMessage("GitHub evidence must verify before success can be resolved.");
      return;
    }

    setErrorMessage("");
    setPendingAction(action);
    try {
      if (action === "evidence") {
        await blockchainService.submitEvidence(
          currentCommitment.id,
          currentCommitment.evidenceType,
          currentCommitment.evidenceReference,
        );
      } else {
        await blockchainService.resolveCommitment(currentCommitment.id, action === "success");
      }
      await queryClient.invalidateQueries({ queryKey: ["commitment", currentCommitment.id] });
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Resolution action failed.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <Shell>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Link
          to="/commitments/$id"
          params={{ id: currentCommitment.id }}
          className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Back to commitment
        </Link>
        <div className="mx-auto max-w-3xl py-14 text-center sm:py-20">
          <div
            className={
              currentCommitment.status === "failed"
                ? "mx-auto grid size-16 place-items-center border border-danger/30 bg-danger-soft text-danger"
                : "mx-auto grid size-16 place-items-center bg-lime text-ink"
            }
          >
            {currentCommitment.status === "failed" ? (
              <CircleX className="size-8" />
            ) : (
              <Check className="size-8" />
            )}
          </div>
          <div className="mt-7 flex items-center justify-center gap-2">
            <StatusBadge status={currentCommitment.status} />
            <span className="font-mono text-[11px] text-faint">{currentCommitment.reference}</span>
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            {currentCommitment.status === "failed" ? "Commitment failed" : "Commitment completed"}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-muted-foreground">
            {currentCommitment.status === "failed"
              ? "The required condition was not satisfied before the deadline."
              : "The resolver recorded evidence and released the escrow."}
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="space-y-6">
            <EvidencePanel
              commitment={displayCommitment}
              verified={verificationResult?.verified ?? false}
            />
            <section className="border border-rule bg-panel p-5 sm:p-6">
              <SectionEyebrow>Resolution record</SectionEyebrow>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {currentCommitment.status === "failed" ? "Deadline" : "Completion timestamp"}
                  </p>
                  <p className="mt-1 font-semibold">
                    {currentCommitment.status === "failed"
                      ? currentCommitment.deadline
                      : currentCommitment.resolvedAt}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    {currentCommitment.status === "failed"
                      ? "Missing evidence"
                      : "Verification result"}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1.5 font-semibold">
                    {currentCommitment.status === "failed" ? (
                      "No qualifying submission"
                    ) : (
                      <>
                        <ShieldCheck className="size-4 text-lime-soft" /> {verificationLabel}
                      </>
                    )}
                  </p>
                </div>
              </div>
            </section>
          </div>
          <aside className="space-y-6">
            <section className="border border-rule bg-panel p-5 sm:p-6">
              <SectionEyebrow>Escrow outcome</SectionEyebrow>
              <p className="mt-5 font-mono text-[10px] uppercase tracking-[.14em] text-faint">
                {currentCommitment.status === "failed"
                  ? "Funds returned to creator"
                  : "Funds released to beneficiary"}
              </p>
              <p className="mt-2 text-3xl font-bold">
                {currentCommitment.amount}{" "}
                <span className="text-sm text-muted-foreground">{currentCommitment.token}</span>
              </p>
              <div className="mt-6 border-t border-rule pt-2">
                <TransactionRow
                  label={
                    currentCommitment.status === "failed"
                      ? "Escrow settlement"
                      : "Release transaction"
                  }
                  hash={
                    currentCommitment.releaseHash ??
                    currentCommitment.transactionHash ??
                    "Unavailable"
                  }
                  status={currentCommitment.mode === "chain" ? "Confirmed" : "Confirmed in demo"}
                />
              </div>
              <a
                href="#explorer"
                className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-lime-soft"
              >
                View on explorer <ExternalLink className="size-3.5" />
              </a>
            </section>

            <section className="border border-rule bg-panel p-5 sm:p-6">
              <SectionEyebrow>Resolver access</SectionEyebrow>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Connected wallet</span>
                  <span className="font-mono">
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Resolver</span>
                  <span className="font-mono">
                    {currentCommitment.mode === "demo"
                      ? "Demo resolver"
                      : currentCommitment.resolver
                        ? `${currentCommitment.resolver.slice(0, 6)}...${currentCommitment.resolver.slice(-4)}`
                        : "Unavailable"}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Authorization</span>
                  <span
                    className={
                      authorized
                        ? "font-semibold text-lime-soft"
                        : "font-semibold text-muted-foreground"
                    }
                  >
                    {authorized ? "Authorized" : "Read only"}
                  </span>
                </div>
              </div>
              <div className="mt-5 grid gap-4 border-t border-rule pt-5">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    Evidence type
                  </p>
                  <p className="border border-input bg-background px-3 py-3 text-sm font-semibold">
                    {evidenceLabel}
                  </p>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    Evidence reference
                  </p>
                  <p className="break-words border border-input bg-background px-3 py-3 font-mono text-xs leading-5">
                    {currentCommitment.evidenceReference}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                <Button
                  variant="outline"
                  onClick={() => runAction("evidence")}
                  disabled={
                    !authorized || pendingAction !== null || !currentCommitment.evidenceReference
                  }
                >
                  {pendingAction === "evidence" ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" /> Submitting evidence
                    </>
                  ) : (
                    "Submit evidence"
                  )}
                </Button>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    variant="accent"
                    onClick={() => runAction("success")}
                    disabled={!canMarkSuccess || pendingAction !== null}
                  >
                    {pendingAction === "success" ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" /> Marking success
                      </>
                    ) : (
                      "Mark success"
                    )}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => runAction("failure")}
                    disabled={!canFail || pendingAction !== null}
                  >
                    {pendingAction === "failure" ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin" /> Marking failure
                      </>
                    ) : (
                      "Mark failure"
                    )}
                  </Button>
                </div>
              </div>
              {errorMessage && <p className="mt-4 text-sm text-danger">{errorMessage}</p>}
              {!authorized && (
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  Connect the resolver wallet to enable on-chain evidence submission and settlement.
                </p>
              )}
              {authorized &&
                currentCommitment.status === "active" &&
                !verificationResult?.verified && (
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    Success resolution stays disabled until GitHub evidence verifies.
                  </p>
                )}
              {currentCommitment.status !== "active" && (
                <p className="mt-4 text-xs leading-5 text-muted-foreground">
                  This commitment is already resolved, so the action panel is read only.
                </p>
              )}
              {!deadlinePassed &&
                currentCommitment.mode !== "demo" &&
                currentCommitment.status === "active" && (
                  <p className="mt-4 text-xs leading-5 text-muted-foreground">
                    Failure resolution stays disabled until the deadline passes.
                  </p>
                )}
            </section>

            <section className="border border-rule bg-panel p-5 sm:p-6">
              <SectionEyebrow>GitHub verification</SectionEyebrow>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Type</span>
                  <span className="font-semibold">{evidenceLabel}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className={
                      verificationResult?.verified
                        ? "font-semibold text-lime-soft"
                        : "font-semibold text-muted-foreground"
                    }
                  >
                    {verificationQuery.isFetching && (
                      <LoaderCircle className="mr-1 inline size-3 animate-spin" />
                    )}
                    {verificationLabel}
                  </span>
                </div>
                <div>
                  <p className="text-muted-foreground">Reference</p>
                  <p className="mt-1 font-mono text-xs leading-5 break-words">
                    {currentCommitment.evidenceReference}
                  </p>
                </div>
                {(verificationResult?.reason || verificationQuery.error) && (
                  <div>
                    <p className="text-muted-foreground">Result</p>
                    <p className="mt-1 text-xs leading-5">
                      {verificationResult?.reason ??
                        (verificationQuery.error instanceof Error
                          ? verificationQuery.error.message
                          : "Evidence verification failed.")}
                    </p>
                  </div>
                )}
                {verificationResult?.githubTimestamp && (
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-muted-foreground">GitHub timestamp</span>
                    <span className="text-right font-mono text-xs">
                      {verificationResult.githubTimestamp}
                    </span>
                  </div>
                )}
                {verificationResult?.githubUrl && (
                  <a
                    href={verificationResult.githubUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-lime-soft"
                  >
                    Open evidence <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </Shell>
  );
}
