export type EvidenceType = "PR_MERGED" | "ISSUE_CLOSED" | "COMMIT_ON_BRANCH";

export type PullRequestMergedEvidence = {
  evidenceType: "PR_MERGED";
  repository: string;
  pullRequestNumber: number;
  deadline?: string | number | Date;
};

export type IssueClosedEvidence = {
  evidenceType: "ISSUE_CLOSED";
  repository: string;
  issueNumber: number;
  deadline?: string | number | Date;
};

export type CommitOnBranchEvidence = {
  evidenceType: "COMMIT_ON_BRANCH";
  repository: string;
  commitSha: string;
  branch: string;
  deadline?: string | number | Date;
};

export type EvidenceRequirement =
  PullRequestMergedEvidence | IssueClosedEvidence | CommitOnBranchEvidence;

export type VerificationStatus =
  "verified" | "failed" | "not_found" | "error" | "unsupported" | "deadline_uncertain" | "demo";

export type VerificationResult = {
  verified: boolean;
  evidenceType: EvidenceType;
  repository: string;
  reference: string;
  checkedAt: string;
  reason: string;
  status: VerificationStatus;
  provider: "github" | "demo";
  githubUrl?: string;
  githubTimestamp?: string;
  errorCode?: string;
};

export type EvidenceDisplay = {
  label: string;
  repository: string;
  primary: string;
  secondary?: string;
  githubUrl?: string;
};

export class EvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceValidationError";
  }
}

export class UnsupportedEvidenceTypeError extends EvidenceValidationError {
  constructor(evidenceType: string) {
    super(`Unsupported evidence type: ${evidenceType}`);
    this.name = "UnsupportedEvidenceTypeError";
  }
}

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const shaPattern = /^[a-fA-F0-9]{7,40}$/;

export function parseDeadline(deadline: string | number | Date | undefined) {
  if (deadline === undefined) {
    return undefined;
  }

  const timestamp = deadline instanceof Date ? deadline.getTime() : Date.parse(String(deadline));
  if (!Number.isFinite(timestamp)) {
    throw new EvidenceValidationError("Deadline must be a valid date");
  }

  return timestamp;
}

function validateRepository(repository: string) {
  if (!repositoryPattern.test(repository)) {
    throw new EvidenceValidationError("Repository must use owner/repository format");
  }
}

function validatePositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new EvidenceValidationError(`${label} must be a positive integer`);
  }
}

function validateCommitSha(commitSha: string) {
  if (!shaPattern.test(commitSha)) {
    throw new EvidenceValidationError("Commit SHA must be a 7 to 40 character hexadecimal value");
  }
}

function validateBranch(branch: string) {
  if (!branch.trim()) {
    throw new EvidenceValidationError("Branch name is required");
  }
}

export function validateEvidenceRequirement(requirement: EvidenceRequirement) {
  validateRepository(requirement.repository);

  switch (requirement.evidenceType) {
    case "PR_MERGED":
      validatePositiveInteger(requirement.pullRequestNumber, "Pull request number");
      break;
    case "ISSUE_CLOSED":
      validatePositiveInteger(requirement.issueNumber, "Issue number");
      break;
    case "COMMIT_ON_BRANCH":
      validateCommitSha(requirement.commitSha);
      validateBranch(requirement.branch);
      break;
    default:
      throw new UnsupportedEvidenceTypeError(
        (requirement as { evidenceType: string }).evidenceType,
      );
  }

  parseDeadline(requirement.deadline);
}

export function buildEvidenceReference(requirement: EvidenceRequirement) {
  validateEvidenceRequirement(requirement);

  switch (requirement.evidenceType) {
    case "PR_MERGED":
      return `github:pr:${requirement.repository}#${requirement.pullRequestNumber}`;
    case "ISSUE_CLOSED":
      return `github:issue:${requirement.repository}#${requirement.issueNumber}`;
    case "COMMIT_ON_BRANCH":
      return `github:commit:${requirement.repository}@${requirement.commitSha}:${requirement.branch}`;
  }
}

export function parseEvidenceReference(
  reference: string,
  deadline?: string | number | Date,
): EvidenceRequirement {
  const pullRequestMatch = reference.match(/^github:pr:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)$/);
  if (pullRequestMatch) {
    const repository = pullRequestMatch[1];
    const pullRequestNumber = pullRequestMatch[2];
    if (!repository || !pullRequestNumber) {
      throw new EvidenceValidationError("Evidence reference is not a supported GitHub reference");
    }

    const requirement: PullRequestMergedEvidence = {
      evidenceType: "PR_MERGED",
      repository,
      pullRequestNumber: Number(pullRequestNumber),
    };
    return deadline === undefined ? requirement : { ...requirement, deadline };
  }

  const issueMatch = reference.match(/^github:issue:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)$/);
  if (issueMatch) {
    const repository = issueMatch[1];
    const issueNumber = issueMatch[2];
    if (!repository || !issueNumber) {
      throw new EvidenceValidationError("Evidence reference is not a supported GitHub reference");
    }

    const requirement: IssueClosedEvidence = {
      evidenceType: "ISSUE_CLOSED",
      repository,
      issueNumber: Number(issueNumber),
    };
    return deadline === undefined ? requirement : { ...requirement, deadline };
  }

  const commitMatch = reference.match(
    /^github:commit:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([a-fA-F0-9]{7,40}):(.+)$/,
  );
  if (commitMatch) {
    const repository = commitMatch[1];
    const commitSha = commitMatch[2];
    const branch = commitMatch[3];
    if (!repository || !commitSha || !branch) {
      throw new EvidenceValidationError("Evidence reference is not a supported GitHub reference");
    }

    const requirement: CommitOnBranchEvidence = {
      evidenceType: "COMMIT_ON_BRANCH",
      repository,
      commitSha,
      branch,
    };
    return deadline === undefined ? requirement : { ...requirement, deadline };
  }

  throw new EvidenceValidationError("Evidence reference is not a supported GitHub reference");
}

export function createDemoVerificationResult(commitment: {
  repository: string;
  condition: string;
  mergeStatus: string;
  mergeDate?: string;
}): VerificationResult {
  const verificationResult: VerificationResult = {
    verified: commitment.mergeStatus === "merged",
    evidenceType: "PR_MERGED",
    repository: commitment.repository,
    reference: commitment.condition,
    checkedAt: new Date().toISOString(),
    reason:
      commitment.mergeStatus === "merged"
        ? "Demo evidence from seeded data. This was not verified through GitHub."
        : "Demo evidence is not verified through GitHub.",
    status: "demo",
    provider: "demo",
  };
  if (commitment.mergeDate) {
    verificationResult.githubTimestamp = commitment.mergeDate;
  }
  return verificationResult;
}

function evidenceTypeLabel(evidenceType: string) {
  switch (evidenceType) {
    case "PR_MERGED":
      return "GitHub Pull Request";
    case "ISSUE_CLOSED":
      return "GitHub Issue";
    case "COMMIT_ON_BRANCH":
      return "GitHub Commit";
    default:
      return evidenceType || "Evidence";
  }
}

export function describeEvidenceReference(
  evidenceType: string,
  reference: string,
): EvidenceDisplay {
  try {
    const parsed = parseEvidenceReference(reference);
    switch (parsed.evidenceType) {
      case "PR_MERGED":
        return {
          label: "GitHub Pull Request",
          repository: parsed.repository,
          primary: `${parsed.repository} #${parsed.pullRequestNumber}`,
          githubUrl: `https://github.com/${parsed.repository}/pull/${parsed.pullRequestNumber}`,
        };
      case "ISSUE_CLOSED":
        return {
          label: "GitHub Issue",
          repository: parsed.repository,
          primary: `${parsed.repository} #${parsed.issueNumber}`,
          githubUrl: `https://github.com/${parsed.repository}/issues/${parsed.issueNumber}`,
        };
      case "COMMIT_ON_BRANCH":
        return {
          label: "GitHub Commit",
          repository: parsed.repository,
          primary:
            parsed.commitSha.length > 10 ? `${parsed.commitSha.slice(0, 10)}...` : parsed.commitSha,
          secondary: `on ${parsed.branch}`,
          githubUrl: `https://github.com/${parsed.repository}/commit/${parsed.commitSha}`,
        };
    }
  } catch {
    return {
      label: evidenceTypeLabel(evidenceType),
      repository: "Unavailable",
      primary: reference || "Unavailable",
    };
  }
}
