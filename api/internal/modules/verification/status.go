package verification

import "strings"

const (
	VerificationStatusUnknown = "unknown"
	VerificationStatusPending = "pending"
	VerificationStatusPassed  = "passed"
	VerificationStatusFailed  = "failed"
	VerificationStatusSkipped = "skipped"
)

type WorkflowRunSignal struct {
	Status     string
	Conclusion string
}

type VerificationStatusSummary struct {
	Status  string
	Total   int
	Failed  int
	Pending int
	Passed  int
	Skipped int
}

func DeriveWorkflowVerificationStatus(runs []WorkflowRunSignal) VerificationStatusSummary {
	summary := VerificationStatusSummary{Status: VerificationStatusUnknown, Total: len(runs)}
	if len(runs) == 0 {
		return summary
	}

	for _, run := range runs {
		status := strings.ToLower(strings.TrimSpace(run.Status))
		conclusion := strings.ToLower(strings.TrimSpace(run.Conclusion))
		if status != "completed" {
			summary.Pending++
			continue
		}
		switch conclusion {
		case "success":
			summary.Passed++
		case "skipped", "neutral":
			summary.Skipped++
		case "":
			summary.Pending++
		default:
			summary.Failed++
		}
	}

	switch {
	case summary.Failed > 0:
		summary.Status = VerificationStatusFailed
	case summary.Pending > 0:
		summary.Status = VerificationStatusPending
	case summary.Passed > 0:
		summary.Status = VerificationStatusPassed
	case summary.Skipped == summary.Total:
		summary.Status = VerificationStatusSkipped
	default:
		summary.Status = VerificationStatusUnknown
	}
	return summary
}
