import { describe, expect, it } from "vitest";

import { hasActiveFixAttempt, isFixAttemptActiveStatus } from "@/features/specforge/fix-attempts";

describe("SpecForge fix attempt helpers", () => {
  it("treats queued and running attempts as active", () => {
    expect(isFixAttemptActiveStatus("queued")).toBe(true);
    expect(isFixAttemptActiveStatus("running")).toBe(true);
    expect(isFixAttemptActiveStatus("fixing")).toBe(true);
  });

  it("does not poll for terminal fix attempt statuses", () => {
    expect(hasActiveFixAttempt([{ status: "success" }, { status: "failed" }])).toBe(false);
  });

  it("polls when any fix attempt is still active", () => {
    expect(hasActiveFixAttempt([{ status: "failed" }, { status: "queued" }])).toBe(true);
  });
});
