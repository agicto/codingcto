package verification

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	infraevents "github.com/zgiai/luas/api/internal/infra/events"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

func TestCreateFixAttemptAssignsAttemptNumberAndDefaults(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)

	first, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType:       " type_error ",
		CILogExcerpt:      "  TS2322  ",
		Confidence:        0.91,
		LikelyCause:       " null role ",
		RecommendedAction: " patch type guard ",
		CanAutoFix:        true,
	})
	require.NoError(t, err)
	second, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType: "lint_failure",
		Status:      domain.FixAttemptStatusFailed,
	})
	require.NoError(t, err)

	require.Equal(t, 1, first.AttemptNumber)
	require.Equal(t, 2, second.AttemptNumber)
	require.Equal(t, domain.FixAttemptStatusQueued, first.Status)
	require.Equal(t, "type_error", first.FailureType)
	require.Equal(t, "TS2322", first.CILogExcerpt)
	require.True(t, first.CanAutoFix)
}

func TestCreateFixAttemptRejectsAfterRetryLimit(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)

	failureTypes := []string{"type_error", "lint_failure", "type_error"}
	for _, failureType := range failureTypes {
		_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
			FailureType: failureType,
		})
		require.NoError(t, err)
	}

	_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType: "type_error",
	})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestCreateFixAttemptRejectsRepeatedSameFailureType(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)

	for i := 0; i < maxConsecutiveFixAttemptsPerFailureType; i++ {
		_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
			FailureType: "type_error",
		})
		require.NoError(t, err)
	}

	_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType: "type_error",
	})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestCreateFixAttemptAllowsSameFailureTypeAfterDifferentFailure(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)

	for _, failureType := range []string{"type_error", "lint_failure"} {
		_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
			FailureType: failureType,
		})
		require.NoError(t, err)
	}

	attempt, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType: "type_error",
	})

	require.NoError(t, err)
	require.Equal(t, 3, attempt.AttemptNumber)
}

func TestListFixAttemptsReturnsPRNodeAttempts(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)
	_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{FailureType: "type_error"})
	require.NoError(t, err)
	_, err = svc.CreateFixAttempt(context.Background(), 7, 99, &CreateFixAttemptRequest{FailureType: "lint_failure"})
	require.NoError(t, err)

	attempts, err := svc.ListFixAttempts(context.Background(), 42)

	require.NoError(t, err)
	require.Len(t, attempts, 1)
	require.Equal(t, uint(42), attempts[0].PRNodeID)
}

func TestCreateFixAttemptFromCIClassifiesFailedLogs(t *testing.T) {
	repo := &memoryRepo{}
	reader := &fakeFailureReader{
		failure: &githubintegration.PRNodeFailureLog{
			PRNodeID:    42,
			JobName:     "API",
			LogExcerpt:  "go test ./...\n--- FAIL: TestInvite\n",
			FailedSteps: []string{"go test"},
		},
	}
	svc := NewService(repo, nil, reader, nil)

	attempt, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
		RepositoryID:   "github_agicto__codingcto",
		WorkflowRunID:  987,
		WorkflowRunURL: "https://github.com/agicto/codingcto/actions/runs/987",
		Conclusion:     "failure",
	})

	require.NoError(t, err)
	require.Equal(t, "github_agicto__codingcto", reader.request.RepositoryID)
	require.Equal(t, uint(42), reader.request.PRNodeID)
	require.Equal(t, 1, attempt.AttemptNumber)
	require.Equal(t, int64(987), attempt.WorkflowRunID)
	require.Equal(t, "https://github.com/agicto/codingcto/actions/runs/987", attempt.WorkflowRunURL)
	require.Equal(t, "failure", attempt.Conclusion)
	require.Equal(t, "unit_test_failure", attempt.FailureType)
	require.Contains(t, attempt.CILogExcerpt, "TestInvite")
	require.Contains(t, attempt.LikelyCause, "go test")
	require.True(t, attempt.CanAutoFix)
}

func TestCreateFixAttemptFromCIClassifiesHighRiskFailureTypes(t *testing.T) {
	cases := []struct {
		name               string
		log                string
		step               string
		wantType           string
		wantAutoFix        bool
		wantActionContains string
	}{
		{
			name:               "missing dependency",
			log:                "Error: Cannot find module '@workspace/invite-client'",
			step:               "pnpm test",
			wantType:           "missing_dependency",
			wantAutoFix:        true,
			wantActionContains: "dependency",
		},
		{
			name:               "migration failure",
			log:                "prisma migrate deploy failed: schema drift detected",
			step:               "migration",
			wantType:           "migration_failure",
			wantAutoFix:        false,
			wantActionContains: "Pause auto-fix",
		},
		{
			name:               "auth permission failure",
			log:                "expected 200 got 403 Forbidden when member creates invite",
			step:               "go test",
			wantType:           "auth_permission_failure",
			wantAutoFix:        false,
			wantActionContains: "auth and permission",
		},
		{
			name:               "flaky timeout",
			log:                "Playwright test timed out after 30000ms",
			step:               "e2e",
			wantType:           "flaky_test",
			wantAutoFix:        false,
			wantActionContains: "Rerun the workflow once",
		},
		{
			name:               "product mismatch",
			log:                "Spec mismatch: acceptance criteria says owner only",
			step:               "spec compliance",
			wantType:           "product_mismatch",
			wantAutoFix:        false,
			wantActionContains: "approved plan",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &memoryRepo{}
			reader := &fakeFailureReader{
				failure: &githubintegration.PRNodeFailureLog{
					PRNodeID:    42,
					JobName:     "CI",
					LogExcerpt:  tc.log,
					FailedSteps: []string{tc.step},
				},
			}
			svc := NewService(repo, nil, reader, nil)

			attempt, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
				RepositoryID: "github_agicto__codingcto",
			})

			require.NoError(t, err)
			require.Equal(t, tc.wantType, attempt.FailureType)
			require.Equal(t, tc.wantAutoFix, attempt.CanAutoFix)
			require.Contains(t, attempt.RecommendedAction, tc.wantActionContains)
			require.Contains(t, attempt.LikelyCause, "GitHub Actions job")
		})
	}
}

func TestFailureClassifierHandlesMissingLogObject(t *testing.T) {
	require.Equal(t, "ci_failure", classifyFailureType(nil))
	require.False(t, canAutoFix(nil))
	require.Contains(t, likelyCause(nil), "No GitHub Actions failure log was available")
	require.Contains(t, recommendedAction(nil), "smallest reproducible failure")
}

func TestCreateFixAttemptFromCIDedupesWorkflowRun(t *testing.T) {
	repo := &memoryRepo{}
	reader := &fakeFailureReader{
		failure: &githubintegration.PRNodeFailureLog{
			PRNodeID:    42,
			JobName:     "API",
			LogExcerpt:  "go test ./...\n--- FAIL: TestInvite\n",
			FailedSteps: []string{"go test"},
		},
	}
	svc := NewService(repo, nil, reader, nil)

	first, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
		RepositoryID:  "github_agicto__codingcto",
		WorkflowRunID: 987,
		Conclusion:    "failure",
	})
	require.NoError(t, err)
	second, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
		RepositoryID:  "github_agicto__codingcto",
		WorkflowRunID: 987,
		Conclusion:    "failure",
	})

	require.NoError(t, err)
	require.Equal(t, first.ID, second.ID)
	require.Equal(t, first.AttemptNumber, second.AttemptNumber)
	require.Len(t, repo.attempts, 1)
}

func TestCreateFixAttemptFromCIRecordsEscalationWhenLogsAreUnavailable(t *testing.T) {
	repo := &memoryRepo{}
	reader := &fakeFailureReader{err: domain.ErrNotFound}
	bus := infraevents.NewEventBus()
	var decision domain.SpecForgePRNodeNeedsDecisionEvent
	bus.Subscribe(domain.EventSpecForgePRNodeNeedsDecision, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeNeedsDecisionEvent)
		require.True(t, ok)
		decision = typed
		return nil
	})
	svc := NewService(repo, nil, reader, bus)

	attempt, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
		RepositoryID:   "github_agicto__codingcto",
		WorkflowRunID:  987,
		WorkflowRunURL: "https://github.com/agicto/codingcto/actions/runs/987",
		Conclusion:     "timed_out",
	})

	require.NoError(t, err)
	require.Equal(t, "github_agicto__codingcto", reader.request.RepositoryID)
	require.Equal(t, uint(42), reader.request.PRNodeID)
	require.Equal(t, "ci_log_unavailable", attempt.FailureType)
	require.Equal(t, domain.FixAttemptStatusFailed, attempt.Status)
	require.Equal(t, int64(987), attempt.WorkflowRunID)
	require.Equal(t, "https://github.com/agicto/codingcto/actions/runs/987", attempt.WorkflowRunURL)
	require.Equal(t, "timed_out", attempt.Conclusion)
	require.False(t, attempt.CanAutoFix)
	require.Contains(t, attempt.CILogExcerpt, "Workflow run ID: 987")
	require.Contains(t, attempt.CILogExcerpt, "Conclusion: timed_out")
	require.Contains(t, attempt.LikelyCause, "could not read a failed job log")
	require.Contains(t, attempt.RecommendedAction, "Open the workflow run in GitHub")
	require.Equal(t, uint(42), decision.PRNodeID)
	require.Equal(t, "ci_log_unavailable", decision.FailureType)
	require.Contains(t, decision.Reason, "could not read a failed job log")
}

func TestCreateFixAttemptFromCIPublishesQueuedAutoFixEvent(t *testing.T) {
	repo := &memoryRepo{}
	reader := &fakeFailureReader{
		failure: &githubintegration.PRNodeFailureLog{
			PRNodeID:      42,
			WorkflowRunID: 654,
			JobName:       "Web",
			LogExcerpt:    "pnpm typecheck\nTS2322: Type mismatch\n",
			FailedSteps:   []string{"pnpm typecheck"},
		},
	}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgeFixAttemptQueuedEvent
	bus.Subscribe(domain.EventSpecForgeFixAttemptQueued, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgeFixAttemptQueuedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, nil, reader, bus)

	attempt, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
		RepositoryID: "github_agicto__codingcto",
	})

	require.NoError(t, err)
	require.Equal(t, attempt.ID, published.FixAttemptID)
	require.Equal(t, int64(654), attempt.WorkflowRunID)
	require.Equal(t, uint(42), published.PRNodeID)
	require.Equal(t, "type_error", published.FailureType)
	require.Contains(t, published.CILogExcerpt, "TS2322")
	require.Contains(t, published.LikelyCause, "pnpm typecheck")
	require.NotEmpty(t, published.RecommendedAction)
}

func TestVerifyPRNodeCIQueuesFixAttemptWhenRefreshFindsFailure(t *testing.T) {
	repo := &memoryRepo{}
	refresher := &fakeCIRefresher{
		node: &domain.SpecForgePRNode{
			ID:     42,
			Status: domain.PRNodeStatusBlocked,
		},
	}
	reader := &fakeFailureReader{
		failure: &githubintegration.PRNodeFailureLog{
			PRNodeID:      42,
			WorkflowRunID: 654,
			JobName:       "Web",
			LogExcerpt:    "pnpm typecheck\nTS2322: Type mismatch\n",
			FailedSteps:   []string{"pnpm typecheck"},
		},
	}
	svc := NewService(repo, refresher, reader, nil)

	result, err := svc.VerifyPRNodeCI(context.Background(), 7, 42, &VerifyPRNodeCIRequest{
		RepositoryID: "github_agicto__codingcto",
	})

	require.NoError(t, err)
	require.Equal(t, "github_agicto__codingcto", refresher.request.RepositoryID)
	require.Equal(t, uint(42), refresher.request.PRNodeID)
	require.Equal(t, "github_agicto__codingcto", reader.request.RepositoryID)
	require.NotNil(t, result.PRNode)
	require.NotNil(t, result.FixAttempt)
	require.NotNil(t, result.EscalationSummary)
	require.Equal(t, "fix_attempt_queued", result.VerificationState)
	require.Equal(t, "Dispatch the queued fix attempt to the Codex runtime.", result.NextAction)
	require.Equal(t, "type_error", result.FixAttempt.FailureType)
	require.Equal(t, int64(654), result.FixAttempt.WorkflowRunID)
	require.Equal(t, 1, result.EscalationSummary.AttemptsUsed)
}

func TestVerifyPRNodeCIReturnsPassedStateWithoutFixAttempt(t *testing.T) {
	repo := &memoryRepo{}
	refresher := &fakeCIRefresher{
		node: &domain.SpecForgePRNode{
			ID:     42,
			Status: domain.PRNodeStatusReadyForReview,
		},
	}
	reader := &fakeFailureReader{}
	svc := NewService(repo, refresher, reader, nil)

	result, err := svc.VerifyPRNodeCI(context.Background(), 7, 42, &VerifyPRNodeCIRequest{
		RepositoryID: "github_agicto__codingcto",
	})

	require.NoError(t, err)
	require.Equal(t, "ci_passed", result.VerificationState)
	require.Equal(t, "Review the pull request in GitHub.", result.NextAction)
	require.Nil(t, result.FixAttempt)
	require.Nil(t, result.EscalationSummary)
	require.Zero(t, reader.request.PRNodeID)
	require.Empty(t, repo.attempts)
}

func TestVerifyPRNodeCIReturnsEscalationWhenAutoFixBudgetIsExhausted(t *testing.T) {
	repo := &memoryRepo{}
	for _, failureType := range []string{"type_error", "lint_failure", "unit_test_failure"} {
		err := repo.CreateFixAttempt(context.Background(), &domain.SpecForgeFixAttempt{
			PRNodeID:      42,
			FailureType:   failureType,
			AttemptNumber: len(repo.attempts) + 1,
			Status:        domain.FixAttemptStatusFailed,
			CanAutoFix:    true,
		})
		require.NoError(t, err)
	}
	refresher := &fakeCIRefresher{
		node: &domain.SpecForgePRNode{
			ID:     42,
			Status: domain.PRNodeStatusBlocked,
		},
	}
	reader := &fakeFailureReader{
		failure: &githubintegration.PRNodeFailureLog{
			PRNodeID:      42,
			WorkflowRunID: 999,
			JobName:       "API",
			LogExcerpt:    "go test ./...\n--- FAIL: TestInvite\n",
			FailedSteps:   []string{"go test"},
		},
	}
	svc := NewService(repo, refresher, reader, nil)

	result, err := svc.VerifyPRNodeCI(context.Background(), 7, 42, &VerifyPRNodeCIRequest{
		RepositoryID: "github_agicto__codingcto",
	})

	require.NoError(t, err)
	require.Nil(t, result.FixAttempt)
	require.NotNil(t, result.EscalationSummary)
	require.Equal(t, "needs_user_decision", result.VerificationState)
	require.Contains(t, result.NextAction, "Pause auto-fix")
	require.Equal(t, maxFixAttemptsPerPRNode, result.EscalationSummary.AttemptsUsed)
	require.False(t, result.EscalationSummary.CanContinueAutoFix)
}

func TestVerifyPRNodeCICreatesEscalationWhenFailureLogIsMissing(t *testing.T) {
	repo := &memoryRepo{}
	refresher := &fakeCIRefresher{
		node: &domain.SpecForgePRNode{
			ID:     42,
			Status: domain.PRNodeStatusBlocked,
		},
	}
	reader := &fakeFailureReader{err: domain.ErrNotFound}
	svc := NewService(repo, refresher, reader, nil)

	result, err := svc.VerifyPRNodeCI(context.Background(), 7, 42, &VerifyPRNodeCIRequest{
		RepositoryID: "github_agicto__codingcto",
	})

	require.NoError(t, err)
	require.NotNil(t, result.FixAttempt)
	require.NotNil(t, result.EscalationSummary)
	require.Equal(t, "needs_user_decision", result.VerificationState)
	require.Equal(t, "ci_log_unavailable", result.FixAttempt.FailureType)
	require.Equal(t, domain.FixAttemptStatusFailed, result.FixAttempt.Status)
	require.False(t, result.FixAttempt.CanAutoFix)
	require.Contains(t, result.FixAttempt.CILogExcerpt, "Conclusion: failure")
}

func TestHandlerCreatesFixAttemptFromPRNodeCIFailedEvent(t *testing.T) {
	repo := &memoryRepo{}
	reader := &fakeFailureReader{
		failure: &githubintegration.PRNodeFailureLog{
			PRNodeID:    42,
			JobName:     "API",
			LogExcerpt:  "go test ./...\n--- FAIL: TestInvite\n",
			FailedSteps: []string{"go test"},
		},
	}
	handler := NewHandler(NewService(repo, nil, reader, nil))
	bus := infraevents.NewEventBus()
	handler.RegisterEvents(bus)

	err := bus.Publish(context.Background(), domain.NewSpecForgePRNodeCIFailedEvent(
		42,
		"github_agicto__codingcto",
		"agicto/codingcto",
		987,
		"https://github.com/agicto/codingcto/actions/runs/987",
		"abc123",
		"failure",
	))

	require.NoError(t, err)
	require.Len(t, repo.attempts, 1)
	require.Equal(t, uint(42), repo.attempts[0].PRNodeID)
	require.Equal(t, "unit_test_failure", repo.attempts[0].FailureType)
	require.Equal(t, uint(0), repo.attempts[0].CreatedBy)
	require.Equal(t, "github_agicto__codingcto", reader.request.RepositoryID)
}

func TestHandlerCreatesEscalationAttemptWhenCILogsAreUnavailable(t *testing.T) {
	repo := &memoryRepo{}
	reader := &fakeFailureReader{err: domain.ErrNotFound}
	handler := NewHandler(NewService(repo, nil, reader, nil))
	bus := infraevents.NewEventBus()
	handler.RegisterEvents(bus)

	err := bus.Publish(context.Background(), domain.NewSpecForgePRNodeCIFailedEvent(
		42,
		"github_agicto__codingcto",
		"agicto/codingcto",
		987,
		"https://github.com/agicto/codingcto/actions/runs/987",
		"abc123",
		"timed_out",
	))

	require.NoError(t, err)
	require.Len(t, repo.attempts, 1)
	require.Equal(t, "ci_log_unavailable", repo.attempts[0].FailureType)
	require.Equal(t, domain.FixAttemptStatusFailed, repo.attempts[0].Status)
	require.False(t, repo.attempts[0].CanAutoFix)
	require.Contains(t, repo.attempts[0].CILogExcerpt, "Workflow run URL: https://github.com/agicto/codingcto/actions/runs/987")
}

func TestHandlerUpdatesFixAttemptFromFinishedFixTaskEvent(t *testing.T) {
	repo := &memoryRepo{}
	handler := NewHandler(NewService(repo, nil, nil, nil))
	bus := infraevents.NewEventBus()
	handler.RegisterEvents(bus)
	attempt, err := handler.service.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType: "type_error",
		CanAutoFix:  true,
	})
	require.NoError(t, err)
	fixID := attempt.ID

	err = bus.Publish(context.Background(), domain.NewSpecForgeFixTaskFinishedEvent(&domain.SpecForgeAgentTask{
		ID:           123,
		PRNodeID:     42,
		Status:       domain.AgentTaskStatusCompleted,
		FixAttemptID: &fixID,
	}))

	require.NoError(t, err)
	require.Equal(t, domain.FixAttemptStatusSuccess, repo.attempts[0].Status)
}

func TestHandlerQueuesNextFixAttemptWhenFixTaskFails(t *testing.T) {
	repo := &memoryRepo{}
	bus := infraevents.NewEventBus()
	handler := NewHandler(NewService(repo, nil, nil, bus))
	handler.RegisterEvents(bus)
	var queued domain.SpecForgeFixAttemptQueuedEvent
	bus.Subscribe(domain.EventSpecForgeFixAttemptQueued, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgeFixAttemptQueuedEvent)
		require.True(t, ok)
		queued = typed
		return nil
	})
	attempt, err := handler.service.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType: "type_error",
		CanAutoFix:  true,
	})
	require.NoError(t, err)
	fixID := attempt.ID

	err = bus.Publish(context.Background(), domain.NewSpecForgeFixTaskFinishedEvent(&domain.SpecForgeAgentTask{
		ID:            123,
		PRNodeID:      42,
		Status:        domain.AgentTaskStatusFailed,
		FailureReason: "executor_failed",
		ErrorLog:      "go test ./...\n--- FAIL: TestInvite",
		FixAttemptID:  &fixID,
	}))

	require.NoError(t, err)
	require.Len(t, repo.attempts, 2)
	require.Equal(t, domain.FixAttemptStatusFailed, repo.attempts[0].Status)
	require.Equal(t, domain.FixAttemptStatusQueued, repo.attempts[1].Status)
	require.Equal(t, "executor_failed", repo.attempts[1].FailureType)
	require.Contains(t, repo.attempts[1].CILogExcerpt, "TestInvite")
	require.Equal(t, repo.attempts[1].ID, queued.FixAttemptID)
	require.Equal(t, uint(42), queued.PRNodeID)
	require.Equal(t, "executor_failed", queued.FailureType)
}

func TestHandlerStopsQueuingFixAttemptsAtBudgetLimit(t *testing.T) {
	repo := &memoryRepo{}
	bus := infraevents.NewEventBus()
	handler := NewHandler(NewService(repo, nil, nil, bus))
	handler.RegisterEvents(bus)
	queuedCount := 0
	var decision domain.SpecForgePRNodeNeedsDecisionEvent
	bus.Subscribe(domain.EventSpecForgeFixAttemptQueued, func(ctx context.Context, event infraevents.Event) error {
		queuedCount++
		return nil
	})
	bus.Subscribe(domain.EventSpecForgePRNodeNeedsDecision, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeNeedsDecisionEvent)
		require.True(t, ok)
		decision = typed
		return nil
	})
	failureTypes := []string{"type_error", "lint_failure", "unit_test_failure"}
	for i := 0; i < maxFixAttemptsPerPRNode; i++ {
		_, err := handler.service.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
			FailureType: failureTypes[i],
			Status:      domain.FixAttemptStatusFailed,
			CanAutoFix:  true,
		})
		require.NoError(t, err)
	}
	fixID := repo.attempts[len(repo.attempts)-1].ID

	err := bus.Publish(context.Background(), domain.NewSpecForgeFixTaskFinishedEvent(&domain.SpecForgeAgentTask{
		ID:            123,
		PRNodeID:      42,
		Status:        domain.AgentTaskStatusFailed,
		FailureReason: "executor_failed",
		FixAttemptID:  &fixID,
	}))

	require.NoError(t, err)
	require.Len(t, repo.attempts, maxFixAttemptsPerPRNode)
	require.Equal(t, 0, queuedCount)
	require.Equal(t, uint(42), decision.PRNodeID)
	require.Equal(t, "executor_failed", decision.FailureType)
	require.Contains(t, decision.Reason, "automatic fix limit")
}

func TestCreateFixAttemptFromCIRejectsMissingReader(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)

	_, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
		RepositoryID: "github_agicto__codingcto",
	})

	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestGetEscalationSummaryAllowsAutoFixBeforeLimit(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)
	_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType:       "type_error",
		LikelyCause:       "GitHub Actions job failed at typecheck.",
		RecommendedAction: "Patch the type guard.",
		CanAutoFix:        true,
	})
	require.NoError(t, err)

	summary, err := svc.GetEscalationSummary(context.Background(), 42)

	require.NoError(t, err)
	require.Equal(t, uint(42), summary.PRNodeID)
	require.Equal(t, "auto_fix_available", summary.Status)
	require.Equal(t, 1, summary.AttemptsUsed)
	require.Equal(t, maxFixAttemptsPerPRNode, summary.MaxAttempts)
	require.Equal(t, []string{"type_error"}, summary.FailureTypes)
	require.True(t, summary.CanContinueAutoFix)
	require.Contains(t, summary.RecommendedOption, "Continue auto-fix")
	require.Equal(t, "Patch the type guard.", summary.LatestAction)
}

func TestGetEscalationSummaryRequiresDecisionForNonAutoFixableLatestAttempt(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)
	_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType:       "ci_log_unavailable",
		Status:            domain.FixAttemptStatusFailed,
		LikelyCause:       "GitHub Actions timed out, but the failed job log was unavailable.",
		RecommendedAction: "Open the workflow run in GitHub.",
		CanAutoFix:        false,
	})
	require.NoError(t, err)

	summary, err := svc.GetEscalationSummary(context.Background(), 42)

	require.NoError(t, err)
	require.Equal(t, "needs_user_decision", summary.Status)
	require.False(t, summary.CanContinueAutoFix)
	require.Contains(t, summary.Reason, "cannot be fixed automatically")
	require.Contains(t, summary.DecisionOptions, "Replan this PR node")
}

func TestGetEscalationSummaryRequiresDecisionAfterLimit(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)
	for i := 0; i < maxFixAttemptsPerPRNode; i++ {
		_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
			FailureType:       []string{"unit_test_failure", "lint_failure", "unit_test_failure"}[i],
			LikelyCause:       "Invite acceptance test failed.",
			RecommendedAction: "Narrow the failing assertion.",
		})
		require.NoError(t, err)
	}

	summary, err := svc.GetEscalationSummary(context.Background(), 42)

	require.NoError(t, err)
	require.Equal(t, "needs_user_decision", summary.Status)
	require.Equal(t, maxFixAttemptsPerPRNode, summary.AttemptsUsed)
	require.False(t, summary.CanContinueAutoFix)
	require.Contains(t, summary.Reason, "used all 3 automatic fix attempts")
	require.Contains(t, summary.DecisionOptions, "Replan this PR node")
	require.Equal(t, "unit_test_failure", summary.LatestFailureType)
}

func TestGetEscalationSummaryRequiresDecisionAfterRepeatedFailureType(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)
	for i := 0; i < maxConsecutiveFixAttemptsPerFailureType; i++ {
		_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
			FailureType:       "type_error",
			LikelyCause:       "The invite API returns null where a role is required.",
			RecommendedAction: "Patch the role guard.",
		})
		require.NoError(t, err)
	}

	summary, err := svc.GetEscalationSummary(context.Background(), 42)

	require.NoError(t, err)
	require.Equal(t, "needs_user_decision", summary.Status)
	require.Equal(t, maxConsecutiveFixAttemptsPerFailureType, summary.AttemptsUsed)
	require.False(t, summary.CanContinueAutoFix)
	require.Contains(t, summary.Reason, "2 consecutive type_error fix attempts")
	require.Contains(t, summary.DecisionOptions, "Continue with a narrower patch")
	require.Contains(t, summary.DecisionOptions, "Replan this PR node")
	require.Equal(t, "type_error", summary.LatestFailureType)
	require.Equal(t, "Patch the role guard.", summary.LatestAction)
}

type fakeFailureReader struct {
	request githubintegration.ReadPRNodeFailureLogRequest
	failure *githubintegration.PRNodeFailureLog
	err     error
}

func (r *fakeFailureReader) ReadPRNodeFailureLog(ctx context.Context, req *githubintegration.ReadPRNodeFailureLogRequest) (*githubintegration.PRNodeFailureLog, error) {
	if req != nil {
		r.request = *req
	}
	return r.failure, r.err
}

type fakeCIRefresher struct {
	request githubintegration.RefreshPRNodeCIRequest
	node    *domain.SpecForgePRNode
	err     error
}

func (r *fakeCIRefresher) RefreshPRNodeCI(ctx context.Context, req *githubintegration.RefreshPRNodeCIRequest) (*domain.SpecForgePRNode, error) {
	if req != nil {
		r.request = *req
	}
	return r.node, r.err
}

type memoryRepo struct {
	nextID   uint
	attempts []*domain.SpecForgeFixAttempt
}

func (r *memoryRepo) CreateFixAttempt(ctx context.Context, attempt *domain.SpecForgeFixAttempt) error {
	r.nextID++
	attempt.ID = r.nextID
	copied := *attempt
	r.attempts = append(r.attempts, &copied)
	return nil
}

func (r *memoryRepo) UpdateFixAttemptStatus(ctx context.Context, fixAttemptID uint, status string) error {
	for _, attempt := range r.attempts {
		if attempt.ID == fixAttemptID {
			attempt.Status = status
			return nil
		}
	}
	return domain.ErrNotFound
}

func (r *memoryRepo) FindFixAttemptByPRNodeIDAndWorkflowRunID(ctx context.Context, prNodeID uint, workflowRunID int64) (*domain.SpecForgeFixAttempt, error) {
	for _, attempt := range r.attempts {
		if attempt.PRNodeID == prNodeID && attempt.WorkflowRunID == workflowRunID {
			copied := *attempt
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) ListFixAttemptsByPRNodeID(ctx context.Context, prNodeID uint) ([]*domain.SpecForgeFixAttempt, error) {
	out := []*domain.SpecForgeFixAttempt{}
	for _, attempt := range r.attempts {
		if attempt.PRNodeID == prNodeID {
			copied := *attempt
			out = append(out, &copied)
		}
	}
	return out, nil
}

func (r *memoryRepo) CountFixAttemptsByPRNodeID(ctx context.Context, prNodeID uint) (int, error) {
	count := 0
	for _, attempt := range r.attempts {
		if attempt.PRNodeID == prNodeID {
			count++
		}
	}
	return count, nil
}
