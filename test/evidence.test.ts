import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildEvidenceReference,
  createDemoVerificationResult,
  parseEvidenceReference,
  validateEvidenceRequirement,
  verifyEvidence,
  type EvidenceRequirement,
} from "../src/services/evidence";
import {
  GitHubApiError,
  type GitHubClient,
  type GitHubCommit,
  type GitHubCompare,
  type GitHubIssue,
  type GitHubPullRequest,
  type GitHubRepository,
} from "../src/services/github";

const checkedAt = new Date("2026-09-11T00:00:00.000Z");
const repository: GitHubRepository = {
  full_name: "owner/repo",
  html_url: "https://github.com/owner/repo",
};

function githubClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    getRepository: async () => repository,
    getPullRequest: async () => {
      throw new Error("Unexpected pull request call");
    },
    getIssue: async () => {
      throw new Error("Unexpected issue call");
    },
    getCommit: async () => {
      throw new Error("Unexpected commit call");
    },
    compareCommits: async () => {
      throw new Error("Unexpected compare call");
    },
    ...overrides,
  };
}

function pullRequest(mergedAt: string | null): GitHubPullRequest {
  return {
    number: 42,
    state: mergedAt ? "closed" : "open",
    merged_at: mergedAt,
    html_url: "https://github.com/owner/repo/pull/42",
  };
}

function issue(
  closedAt: string | null,
  state: GitHubIssue["state"] = closedAt ? "closed" : "open",
): GitHubIssue {
  return {
    number: 123,
    state,
    closed_at: closedAt,
    html_url: "https://github.com/owner/repo/issues/123",
  };
}

function commit(timestamp?: string): GitHubCommit {
  return {
    sha: "abc1234",
    html_url: "https://github.com/owner/repo/commit/abc1234",
    commit: timestamp
      ? {
          committer: { date: timestamp },
          author: { date: timestamp },
        }
      : {},
  };
}

function comparison(status: GitHubCompare["status"]): GitHubCompare {
  return {
    status,
    ahead_by: status === "ahead" ? 1 : 0,
    behind_by: status === "behind" ? 1 : 0,
  };
}

test("builds and parses compact GitHub evidence references", () => {
  const requirement: EvidenceRequirement = {
    evidenceType: "COMMIT_ON_BRANCH",
    repository: "owner/repo",
    commitSha: "abc1234",
    branch: "main",
  };

  const reference = buildEvidenceReference(requirement);

  assert.equal(reference, "github:commit:owner/repo@abc1234:main");
  assert.deepEqual(parseEvidenceReference(reference), requirement);
});

test("rejects malformed and unsupported evidence requirements", () => {
  assert.throws(
    () =>
      buildEvidenceReference({
        evidenceType: "PR_MERGED",
        repository: "owner",
        pullRequestNumber: 42,
      }),
    /Repository must use owner\/repository format/,
  );
  assert.throws(
    () =>
      buildEvidenceReference({
        evidenceType: "ISSUE_CLOSED",
        repository: "owner/repo",
        issueNumber: 0,
      }),
    /Issue number must be a positive integer/,
  );
  assert.throws(
    () =>
      validateEvidenceRequirement({
        evidenceType: "MANUAL_NOTE",
        repository: "owner/repo",
      } as unknown as EvidenceRequirement),
    /Unsupported evidence type/,
  );
});

test("verifies merged pull requests and enforces deadlines", async () => {
  const baseRequirement: EvidenceRequirement = {
    evidenceType: "PR_MERGED",
    repository: "owner/repo",
    pullRequestNumber: 42,
    deadline: "2026-09-20T23:59:59Z",
  };

  const verified = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getPullRequest: async () => pullRequest("2026-09-18T12:00:00Z"),
    }),
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.status, "verified");

  const missingTimestamp = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getPullRequest: async () => pullRequest(null),
    }),
  });
  assert.equal(missingTimestamp.verified, false);
  assert.equal(missingTimestamp.status, "deadline_uncertain");

  const malformedTimestamp = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getPullRequest: async () => pullRequest("not-a-date"),
    }),
  });
  assert.equal(malformedTimestamp.verified, false);
  assert.equal(malformedTimestamp.status, "deadline_uncertain");

  const late = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getPullRequest: async () => pullRequest("2026-09-21T00:00:00Z"),
    }),
  });
  assert.equal(late.verified, false);
  assert.equal(late.reason, "Pull request was merged after the promise deadline.");
});

test("verifies closed issues and rejects pull request issue records", async () => {
  const baseRequirement: EvidenceRequirement = {
    evidenceType: "ISSUE_CLOSED",
    repository: "owner/repo",
    issueNumber: 123,
    deadline: "2026-09-20T23:59:59Z",
  };

  const verified = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getIssue: async () => issue("2026-09-18T12:00:00Z"),
    }),
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.status, "verified");

  const open = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getIssue: async () => issue(null),
    }),
  });
  assert.equal(open.verified, false);
  assert.equal(open.status, "failed");

  const missingTimestamp = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getIssue: async () => issue(null, "closed"),
    }),
  });
  assert.equal(missingTimestamp.verified, false);
  assert.equal(missingTimestamp.status, "deadline_uncertain");

  const malformedTimestamp = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getIssue: async () => issue("not-a-date", "closed"),
    }),
  });
  assert.equal(malformedTimestamp.verified, false);
  assert.equal(malformedTimestamp.status, "deadline_uncertain");

  const pullRequestRecord = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getIssue: async () => ({
        ...issue("2026-09-18T12:00:00Z"),
        pull_request: {},
      }),
    }),
  });
  assert.equal(pullRequestRecord.verified, false);
  assert.equal(
    pullRequestRecord.reason,
    "GitHub reference points to a pull request, not an issue.",
  );

  const late = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getIssue: async () => issue("2026-09-21T00:00:00Z"),
    }),
  });
  assert.equal(late.verified, false);
  assert.equal(late.reason, "Issue was closed after the promise deadline.");
});

test("verifies commits reachable from branches and reports deadline uncertainty", async () => {
  const baseRequirement: EvidenceRequirement = {
    evidenceType: "COMMIT_ON_BRANCH",
    repository: "owner/repo",
    commitSha: "abc1234",
    branch: "main",
    deadline: "2026-09-20T23:59:59Z",
  };

  const verified = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getCommit: async () => commit("2026-09-18T12:00:00Z"),
      compareCommits: async () => comparison("ahead"),
    }),
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.status, "verified");

  const notReachable = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getCommit: async () => commit("2026-09-18T12:00:00Z"),
      compareCommits: async () => comparison("behind"),
    }),
  });
  assert.equal(notReachable.verified, false);
  assert.equal(
    notReachable.reason,
    "Commit exists but is not reachable from the specified branch.",
  );

  const uncertain = await verifyEvidence(baseRequirement, {
    checkedAt,
    githubClient: githubClient({
      getCommit: async () => commit(),
      compareCommits: async () => comparison("identical"),
    }),
  });
  assert.equal(uncertain.verified, false);
  assert.equal(uncertain.status, "deadline_uncertain");
});

test("distinguishes invalid evidence, missing GitHub data, and API failures", async () => {
  const requirement: EvidenceRequirement = {
    evidenceType: "PR_MERGED",
    repository: "owner/repo",
    pullRequestNumber: 42,
  };

  const missing = await verifyEvidence(requirement, {
    checkedAt,
    githubClient: githubClient({
      getPullRequest: async () => {
        throw new GitHubApiError("Not found", 404, "not_found");
      },
    }),
  });
  assert.equal(missing.status, "not_found");
  assert.equal(missing.errorCode, "not_found");

  const rateLimited = await verifyEvidence(requirement, {
    checkedAt,
    githubClient: githubClient({
      getRepository: async () => {
        throw new GitHubApiError("Rate limited", 403, "rate_limited");
      },
    }),
  });
  assert.equal(rateLimited.status, "error");
  assert.equal(rateLimited.errorCode, "rate_limited");

  const network = await verifyEvidence(requirement, {
    checkedAt,
    githubClient: githubClient({
      getRepository: async () => {
        throw new GitHubApiError("Network unavailable", 0, "network");
      },
    }),
  });
  assert.equal(network.status, "error");
  assert.equal(network.errorCode, "network");
});

test("does not treat demo evidence as verified GitHub evidence", () => {
  const demo = createDemoVerificationResult({
    repository: "owner/repo",
    condition: "GitHub PR #42 merged",
    mergeStatus: "merged",
    mergeDate: "2026-09-18T12:00:00Z",
  });

  assert.equal(demo.verified, false);
  assert.equal(demo.status, "demo");
  assert.equal(demo.reason, "Demo evidence is not verified through GitHub.");
});

test("keeps GitHub token usage behind the server verification boundary", () => {
  const serverBoundarySource = readFileSync("src/services/evidenceVerification.ts", "utf8");
  const resolutionRouteSource = readFileSync("src/routes/resolution.$id.tsx", "utf8");

  assert.match(serverBoundarySource, /GITHUB_TOKEN/);
  assert.doesNotMatch(serverBoundarySource, /VITE_/);
  assert.doesNotMatch(resolutionRouteSource, /GITHUB_TOKEN|createGitHubRestClient/);
  assert.match(resolutionRouteSource, /verifyEvidenceOnServer/);
});
