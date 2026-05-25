package verification

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDeriveWorkflowVerificationStatusUnknownWhenNoRuns(t *testing.T) {
	got := DeriveWorkflowVerificationStatus(nil)

	require.Equal(t, VerificationStatusUnknown, got.Status)
	require.Zero(t, got.Total)
}

func TestDeriveWorkflowVerificationStatusFailureBeatsPendingAndPassed(t *testing.T) {
	got := DeriveWorkflowVerificationStatus([]WorkflowRunSignal{
		{Status: "completed", Conclusion: "success"},
		{Status: "in_progress"},
		{Status: "completed", Conclusion: "failure"},
	})

	require.Equal(t, VerificationStatusFailed, got.Status)
	require.Equal(t, 3, got.Total)
	require.Equal(t, 1, got.Failed)
	require.Equal(t, 1, got.Pending)
	require.Equal(t, 1, got.Passed)
}

func TestDeriveWorkflowVerificationStatusPendingBeatsPassed(t *testing.T) {
	got := DeriveWorkflowVerificationStatus([]WorkflowRunSignal{
		{Status: "completed", Conclusion: "success"},
		{Status: "queued"},
	})

	require.Equal(t, VerificationStatusPending, got.Status)
	require.Equal(t, 1, got.Pending)
	require.Equal(t, 1, got.Passed)
}

func TestDeriveWorkflowVerificationStatusPassedWhenAnyRunSucceeded(t *testing.T) {
	got := DeriveWorkflowVerificationStatus([]WorkflowRunSignal{
		{Status: "completed", Conclusion: "success"},
		{Status: "completed", Conclusion: "neutral"},
	})

	require.Equal(t, VerificationStatusPassed, got.Status)
	require.Equal(t, 1, got.Passed)
	require.Equal(t, 1, got.Skipped)
}

func TestDeriveWorkflowVerificationStatusSkippedWhenEveryRunSkippedOrNeutral(t *testing.T) {
	got := DeriveWorkflowVerificationStatus([]WorkflowRunSignal{
		{Status: "completed", Conclusion: "skipped"},
		{Status: "completed", Conclusion: "neutral"},
	})

	require.Equal(t, VerificationStatusSkipped, got.Status)
	require.Equal(t, 2, got.Skipped)
}

func TestDeriveWorkflowVerificationStatusTreatsCompletedWithoutConclusionAsPending(t *testing.T) {
	got := DeriveWorkflowVerificationStatus([]WorkflowRunSignal{
		{Status: "completed"},
	})

	require.Equal(t, VerificationStatusPending, got.Status)
	require.Equal(t, 1, got.Pending)
}
