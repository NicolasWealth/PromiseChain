import * as assert from "node:assert/strict";
import { test } from "node:test";

import { buildPromiseRecord, type PromiseRecordCommitment } from "../src/services/promiseRecord";

function commitments(
  count: number,
  commitment: PromiseRecordCommitment,
): PromiseRecordCommitment[] {
  return Array.from({ length: count }, () => ({ ...commitment }));
}

test("handles no commitments", () => {
  const record = buildPromiseRecord([]);

  assert.equal(record.totalCommitments, 0);
  assert.equal(record.successfulCommitments, 0);
  assert.equal(record.failedCommitments, 0);
  assert.equal(record.activeCommitments, 0);
  assert.equal(record.fulfillment, null);
  assert.equal(record.verifiedEvidence, null);
});

test("does not calculate fulfillment for only active commitments", () => {
  const record = buildPromiseRecord(commitments(3, { status: "active" }));

  assert.equal(record.totalCommitments, 3);
  assert.equal(record.activeCommitments, 3);
  assert.equal(record.resolvedCommitments, 0);
  assert.equal(record.fulfillment, null);
});

test("calculates 80 percent fulfillment from 8 successful, 2 failed, and 2 active", () => {
  const record = buildPromiseRecord([
    ...commitments(8, { status: "completed" }),
    ...commitments(2, { status: "failed" }),
    ...commitments(2, { status: "active" }),
  ]);

  assert.deepEqual(record.fulfillment, {
    percentage: 80,
    successful: 8,
    resolved: 10,
  });
});

test("calculates zero percent fulfillment for only failed commitments", () => {
  const record = buildPromiseRecord(commitments(3, { status: "failed" }));

  assert.deepEqual(record.fulfillment, {
    percentage: 0,
    successful: 0,
    resolved: 3,
  });
});

test("counts verified evidence from successful commitments", () => {
  const record = buildPromiseRecord([
    ...commitments(8, { status: "completed", verifiedAt: "Sep 08, 2026 at 14:33 UTC" }),
    ...commitments(1, { status: "completed" }),
    ...commitments(2, { status: "failed", verifiedAt: "Sep 09, 2026 at 14:33 UTC" }),
  ]);

  assert.deepEqual(record.verifiedEvidence, {
    verified: 8,
    successful: 9,
  });
});

test("does not fabricate verified evidence when verification data is missing", () => {
  const record = buildPromiseRecord(commitments(2, { status: "completed" }));

  assert.deepEqual(record.verifiedEvidence, {
    verified: 0,
    successful: 2,
  });
});

test("excludes active and evidence-submitted commitments from fulfillment denominator", () => {
  const record = buildPromiseRecord([
    { status: "completed" },
    { status: "failed" },
    { status: "active" },
    { status: "active", submittedAt: "Sep 08, 2026 at 14:33 UTC" },
  ]);

  assert.equal(record.evidenceSubmittedCommitments, 1);
  assert.deepEqual(record.fulfillment, {
    percentage: 50,
    successful: 1,
    resolved: 2,
  });
});

test("does not weight fulfillment by ETH amount", () => {
  const record = buildPromiseRecord([
    { status: "completed", amount: "0.01" },
    { status: "failed", amount: "1" },
  ]);

  assert.deepEqual(record.fulfillment, {
    percentage: 50,
    successful: 1,
    resolved: 2,
  });
});
