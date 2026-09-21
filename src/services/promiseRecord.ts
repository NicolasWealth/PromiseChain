export type PromiseRecordStatus = "active" | "completed" | "failed";

export type PromiseRecordCommitment = {
  status: PromiseRecordStatus;
  submittedAt?: string | null | undefined;
  verifiedAt?: string | null | undefined;
  amount?: string | number | null | undefined;
};

export type PromiseRecordFulfillment = {
  percentage: number;
  successful: number;
  resolved: number;
};

export type PromiseRecordEvidence = {
  verified: number;
  successful: number;
};

export type PromiseRecordMetrics = {
  totalCommitments: number;
  successfulCommitments: number;
  failedCommitments: number;
  activeCommitments: number;
  evidenceSubmittedCommitments: number;
  resolvedCommitments: number;
  fulfillment: PromiseRecordFulfillment | null;
  verifiedEvidence: PromiseRecordEvidence | null;
};

export function buildPromiseRecord(
  commitments: readonly PromiseRecordCommitment[],
): PromiseRecordMetrics {
  const successfulCommitments = commitments.filter(
    (commitment) => commitment.status === "completed",
  );
  const failedCommitments = commitments.filter((commitment) => commitment.status === "failed");
  const unresolvedCommitments = commitments.filter((commitment) => commitment.status === "active");
  const evidenceSubmittedCommitments = unresolvedCommitments.filter((commitment) =>
    Boolean(commitment.submittedAt),
  );
  const resolvedCommitments = successfulCommitments.length + failedCommitments.length;
  const verifiedEvidence = successfulCommitments.filter((commitment) =>
    Boolean(commitment.verifiedAt),
  ).length;

  return {
    totalCommitments: commitments.length,
    successfulCommitments: successfulCommitments.length,
    failedCommitments: failedCommitments.length,
    activeCommitments: unresolvedCommitments.length,
    evidenceSubmittedCommitments: evidenceSubmittedCommitments.length,
    resolvedCommitments,
    fulfillment:
      resolvedCommitments > 0
        ? {
            percentage: Math.round((successfulCommitments.length / resolvedCommitments) * 100),
            successful: successfulCommitments.length,
            resolved: resolvedCommitments,
          }
        : null,
    verifiedEvidence:
      successfulCommitments.length > 0
        ? {
            verified: Math.min(verifiedEvidence, successfulCommitments.length),
            successful: successfulCommitments.length,
          }
        : null,
  };
}
