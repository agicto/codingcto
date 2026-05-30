import type { SpecForgeFixAttemptDTO } from "@/features/specforge/services/specforge-service";

export const activeFixAttemptPollMs = 5000;

export function isFixAttemptActiveStatus(status?: string) {
  return status === "queued" || status === "running" || status === "fixing";
}

export function hasActiveFixAttempt(
  attempts?: Array<Pick<SpecForgeFixAttemptDTO, "status">>
) {
  return attempts?.some((attempt) => isFixAttemptActiveStatus(attempt.status)) ?? false;
}
