import { describe, expect, it } from "vitest";

import { isPRNodeActive, isPRNodeDelivered } from "@/features/specforge/status";

describe("SpecForge PR node status helpers", () => {
  it("treats ready and merged PR nodes as delivered", () => {
    expect(isPRNodeDelivered("completed")).toBe(true);
    expect(isPRNodeDelivered("ready_for_review")).toBe(true);
    expect(isPRNodeDelivered("merged")).toBe(true);
  });

  it("does not treat in-flight PR lifecycle states as delivered", () => {
    expect(isPRNodeDelivered("pr_opened")).toBe(false);
    expect(isPRNodeDelivered("ci_running")).toBe(false);
    expect(isPRNodeDelivered("blocked")).toBe(false);
  });

  it("treats running and CI-running nodes as active", () => {
    expect(isPRNodeActive("running")).toBe(true);
    expect(isPRNodeActive("ci_running")).toBe(true);
    expect(isPRNodeActive("merged")).toBe(false);
  });
});
