import type { PRNode } from "@/features/specforge/types";

export function isPRNodeDelivered(status: PRNode["status"]) {
  return status === "completed" || status === "ready_for_review" || status === "merged";
}

export function isPRNodeActive(status: PRNode["status"]) {
  return status === "running" || status === "ci_running";
}
