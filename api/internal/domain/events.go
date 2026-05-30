package domain

import (
	"context"
	"sync"
	"time"
)

// Event represents a domain event
type Event interface {
	EventName() string
	OccurredAt() time.Time
}

// BaseEvent provides common event fields
type BaseEvent struct {
	occurredAt time.Time
}

// OccurredAt returns when the event occurred
func (e BaseEvent) OccurredAt() time.Time {
	return e.occurredAt
}

// NewBaseEvent creates a new base event
func NewBaseEvent() BaseEvent {
	return BaseEvent{occurredAt: time.Now()}
}

// User Domain Events

// UserRegisteredEvent is fired when a new user registers
type UserRegisteredEvent struct {
	BaseEvent
	UserID   uint
	Username string
	Email    string
}

// EventName returns the event name
func (e UserRegisteredEvent) EventName() string {
	return "user.registered"
}

// NewUserRegisteredEvent creates a new UserRegisteredEvent
func NewUserRegisteredEvent(userID uint, username, email string) UserRegisteredEvent {
	return UserRegisteredEvent{
		BaseEvent: NewBaseEvent(),
		UserID:    userID,
		Username:  username,
		Email:     email,
	}
}

// UserLoggedInEvent is fired when a user logs in
type UserLoggedInEvent struct {
	BaseEvent
	UserID    uint
	Username  string
	IPAddress string
}

// EventName returns the event name
func (e UserLoggedInEvent) EventName() string {
	return "user.logged_in"
}

// NewUserLoggedInEvent creates a new UserLoggedInEvent
func NewUserLoggedInEvent(userID uint, username, ip string) UserLoggedInEvent {
	return UserLoggedInEvent{
		BaseEvent: NewBaseEvent(),
		UserID:    userID,
		Username:  username,
		IPAddress: ip,
	}
}

// UserPasswordChangedEvent is fired when a user changes their password
type UserPasswordChangedEvent struct {
	BaseEvent
	UserID uint
}

// EventName returns the event name
func (e UserPasswordChangedEvent) EventName() string {
	return "user.password_changed"
}

// NewUserPasswordChangedEvent creates a new UserPasswordChangedEvent
func NewUserPasswordChangedEvent(userID uint) UserPasswordChangedEvent {
	return UserPasswordChangedEvent{
		BaseEvent: NewBaseEvent(),
		UserID:    userID,
	}
}

// UserDeletedEvent is fired when a user account is deleted
type UserDeletedEvent struct {
	BaseEvent
	UserID uint
	Email  string
}

// EventName returns the event name
func (e UserDeletedEvent) EventName() string {
	return "user.deleted"
}

// NewUserDeletedEvent creates a new UserDeletedEvent
func NewUserDeletedEvent(userID uint, email string) UserDeletedEvent {
	return UserDeletedEvent{
		BaseEvent: NewBaseEvent(),
		UserID:    userID,
		Email:     email,
	}
}

// Permission Domain Events

// RoleAssignedEvent is fired when a role is assigned to a user
type RoleAssignedEvent struct {
	BaseEvent
	UserID   uint
	RoleID   uint
	RoleName string
}

// EventName returns the event name
func (e RoleAssignedEvent) EventName() string {
	return "role.assigned"
}

// NewRoleAssignedEvent creates a new RoleAssignedEvent
func NewRoleAssignedEvent(userID, roleID uint, roleName string) RoleAssignedEvent {
	return RoleAssignedEvent{
		BaseEvent: NewBaseEvent(),
		UserID:    userID,
		RoleID:    roleID,
		RoleName:  roleName,
	}
}

// RoleRevokedEvent is fired when a role is revoked from a user
type RoleRevokedEvent struct {
	BaseEvent
	UserID   uint
	RoleID   uint
	RoleName string
}

// EventName returns the event name
func (e RoleRevokedEvent) EventName() string {
	return "role.revoked"
}

// NewRoleRevokedEvent creates a new RoleRevokedEvent
func NewRoleRevokedEvent(userID, roleID uint, roleName string) RoleRevokedEvent {
	return RoleRevokedEvent{
		BaseEvent: NewBaseEvent(),
		UserID:    userID,
		RoleID:    roleID,
		RoleName:  roleName,
	}
}

const EventSpecForgeReviewFeedbackReceived = "specforge.review_feedback.received"
const EventSpecForgeFixAttemptQueued = "specforge.fix_attempt.queued"
const EventSpecForgeFixTaskFinished = "specforge.fix_task.finished"
const EventSpecForgePRNodeCIFailed = "specforge.pr_node.ci_failed"
const EventSpecForgePRNodeDependencySatisfied = "specforge.pr_node.dependency_satisfied"

// SpecForgeReviewFeedbackReceivedEvent is fired when GitHub review feedback can be mapped to a SpecForge PR node.
type SpecForgeReviewFeedbackReceivedEvent struct {
	BaseEvent
	PRNodeID           uint
	GitHubPRNumber     int
	RepositoryFullName string
	Feedback           string
	AuthorLogin        string
	HTMLURL            string
	Path               string
	CommitSHA          string
}

func (e SpecForgeReviewFeedbackReceivedEvent) EventName() string {
	return EventSpecForgeReviewFeedbackReceived
}

func NewSpecForgeReviewFeedbackReceivedEvent(prNodeID uint, prNumber int, repositoryFullName, feedback, authorLogin, htmlURL, path, commitSHA string) SpecForgeReviewFeedbackReceivedEvent {
	return SpecForgeReviewFeedbackReceivedEvent{
		BaseEvent:          NewBaseEvent(),
		PRNodeID:           prNodeID,
		GitHubPRNumber:     prNumber,
		RepositoryFullName: repositoryFullName,
		Feedback:           feedback,
		AuthorLogin:        authorLogin,
		HTMLURL:            htmlURL,
		Path:               path,
		CommitSHA:          commitSHA,
	}
}

// SpecForgeFixAttemptQueuedEvent is fired when a CI failure has been classified and can be auto-fixed.
type SpecForgeFixAttemptQueuedEvent struct {
	BaseEvent
	FixAttemptID      uint
	PRNodeID          uint
	FailureType       string
	CILogExcerpt      string
	LikelyCause       string
	RecommendedAction string
}

func (e SpecForgeFixAttemptQueuedEvent) EventName() string {
	return EventSpecForgeFixAttemptQueued
}

func NewSpecForgeFixAttemptQueuedEvent(attempt *SpecForgeFixAttempt) SpecForgeFixAttemptQueuedEvent {
	event := SpecForgeFixAttemptQueuedEvent{BaseEvent: NewBaseEvent()}
	if attempt == nil {
		return event
	}
	event.FixAttemptID = attempt.ID
	event.PRNodeID = attempt.PRNodeID
	event.FailureType = attempt.FailureType
	event.CILogExcerpt = attempt.CILogExcerpt
	event.LikelyCause = attempt.LikelyCause
	event.RecommendedAction = attempt.RecommendedAction
	return event
}

// SpecForgeFixTaskFinishedEvent is fired when an agent task linked to a fix attempt reaches a terminal state.
type SpecForgeFixTaskFinishedEvent struct {
	BaseEvent
	FixAttemptID     uint
	PRNodeID         uint
	TaskID           uint
	TaskStatus       string
	FixAttemptStatus string
	FailureReason    string
	OutputLog        string
	ErrorLog         string
}

func (e SpecForgeFixTaskFinishedEvent) EventName() string {
	return EventSpecForgeFixTaskFinished
}

func NewSpecForgeFixTaskFinishedEvent(task *SpecForgeAgentTask) SpecForgeFixTaskFinishedEvent {
	event := SpecForgeFixTaskFinishedEvent{BaseEvent: NewBaseEvent()}
	if task == nil || task.FixAttemptID == nil {
		return event
	}
	event.FixAttemptID = *task.FixAttemptID
	event.PRNodeID = task.PRNodeID
	event.TaskID = task.ID
	event.TaskStatus = task.Status
	event.FailureReason = task.FailureReason
	event.OutputLog = task.OutputLog
	event.ErrorLog = task.ErrorLog
	switch task.Status {
	case AgentTaskStatusCompleted:
		event.FixAttemptStatus = FixAttemptStatusSuccess
	case AgentTaskStatusFailed, AgentTaskStatusCancelled:
		event.FixAttemptStatus = FixAttemptStatusFailed
	default:
		event.FixAttemptStatus = FixAttemptStatusQueued
	}
	return event
}

// SpecForgePRNodeCIFailedEvent is fired when a GitHub workflow failure maps to a SpecForge PR node.
type SpecForgePRNodeCIFailedEvent struct {
	BaseEvent
	PRNodeID           uint
	RepositoryID       string
	RepositoryFullName string
	WorkflowRunID      int64
	WorkflowRunURL     string
	HeadSHA            string
	Conclusion         string
}

func (e SpecForgePRNodeCIFailedEvent) EventName() string {
	return EventSpecForgePRNodeCIFailed
}

func NewSpecForgePRNodeCIFailedEvent(prNodeID uint, repositoryID, repositoryFullName string, runID int64, runURL, headSHA, conclusion string) SpecForgePRNodeCIFailedEvent {
	return SpecForgePRNodeCIFailedEvent{
		BaseEvent:          NewBaseEvent(),
		PRNodeID:           prNodeID,
		RepositoryID:       repositoryID,
		RepositoryFullName: repositoryFullName,
		WorkflowRunID:      runID,
		WorkflowRunURL:     runURL,
		HeadSHA:            headSHA,
		Conclusion:         conclusion,
	}
}

// SpecForgePRNodeDependencySatisfiedEvent is fired when a PR node can satisfy downstream DAG dependencies.
type SpecForgePRNodeDependencySatisfiedEvent struct {
	BaseEvent
	PRNodeID uint
	PlanID   uint
	NodeKey  string
	Status   string
}

func (e SpecForgePRNodeDependencySatisfiedEvent) EventName() string {
	return EventSpecForgePRNodeDependencySatisfied
}

func NewSpecForgePRNodeDependencySatisfiedEvent(node *SpecForgePRNode) SpecForgePRNodeDependencySatisfiedEvent {
	event := SpecForgePRNodeDependencySatisfiedEvent{BaseEvent: NewBaseEvent()}
	if node == nil {
		return event
	}
	event.PRNodeID = node.ID
	event.PlanID = node.PlanID
	event.NodeKey = node.NodeKey
	event.Status = node.Status
	return event
}

// EventHandler handles domain events
type EventHandler func(ctx context.Context, event Event) error

// EventDispatcher dispatches domain events to handlers
type EventDispatcher struct {
	handlers map[string][]EventHandler
	mu       sync.RWMutex
}

// NewEventDispatcher creates a new event dispatcher
func NewEventDispatcher() *EventDispatcher {
	return &EventDispatcher{
		handlers: make(map[string][]EventHandler),
	}
}

// Subscribe registers a handler for an event type
func (d *EventDispatcher) Subscribe(eventName string, handler EventHandler) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.handlers[eventName] = append(d.handlers[eventName], handler)
}

// Dispatch dispatches an event to all registered handlers
func (d *EventDispatcher) Dispatch(ctx context.Context, event Event) error {
	d.mu.RLock()
	handlers := d.handlers[event.EventName()]
	d.mu.RUnlock()

	for _, handler := range handlers {
		if err := handler(ctx, event); err != nil {
			return err
		}
	}
	return nil
}

// DispatchAsync dispatches an event asynchronously
func (d *EventDispatcher) DispatchAsync(ctx context.Context, event Event) {
	d.mu.RLock()
	handlers := d.handlers[event.EventName()]
	d.mu.RUnlock()

	for _, handler := range handlers {
		go func(h EventHandler) {
			_ = h(ctx, event)
		}(handler)
	}
}

// Global event dispatcher instance
var globalDispatcher = NewEventDispatcher()

// Subscribe registers a handler for an event type (global)
func Subscribe(eventName string, handler EventHandler) {
	globalDispatcher.Subscribe(eventName, handler)
}

// Dispatch dispatches an event (global)
func Dispatch(ctx context.Context, event Event) error {
	return globalDispatcher.Dispatch(ctx, event)
}

// DispatchAsync dispatches an event asynchronously (global)
func DispatchAsync(ctx context.Context, event Event) {
	globalDispatcher.DispatchAsync(ctx, event)
}
