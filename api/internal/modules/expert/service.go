package expert

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	agentcontract "github.com/zgiai/luas/api/internal/contracts/agent"
	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	ListExperts(ctx context.Context, activeOnly bool) ([]*domain.CodingCTOExpert, error)
	UpsertExpert(ctx context.Context, userID uint, req *UpsertExpertRequest) (*domain.CodingCTOExpert, error)
	GetExpert(ctx context.Context, id uint) (*domain.CodingCTOExpert, error)
	ListExpertSkills(ctx context.Context, expertID uint) ([]*domain.CodingCTOExpertSkill, error)
	UpsertExpertSkill(ctx context.Context, userID, expertID uint, req *UpsertExpertSkillRequest) (*domain.CodingCTOExpertSkill, error)
	ListSkillVersions(ctx context.Context, skillID uint) ([]*domain.CodingCTOExpertSkillVersion, error)
	CreateSkillVersion(ctx context.Context, userID, skillID uint, req *CreateExpertSkillVersionRequest) (*domain.CodingCTOExpertSkillVersion, error)
	ListExpertRuns(ctx context.Context, expertID uint) ([]*domain.CodingCTOExpertRun, error)
	CreateEvolutionProposal(ctx context.Context, userID, skillID uint, req *CreateEvolutionProposalRequest) (*domain.CodingCTOSkillEvolutionProposal, error)
	ListEvolutionProposals(ctx context.Context, skillID uint) ([]*domain.CodingCTOSkillEvolutionProposal, error)
	ApproveEvolutionProposal(ctx context.Context, userID, proposalID uint) (*domain.CodingCTOSkillEvolutionProposal, error)
	RejectEvolutionProposal(ctx context.Context, userID, proposalID uint) (*domain.CodingCTOSkillEvolutionProposal, error)
	PromoteEvolutionProposal(ctx context.Context, userID, proposalID uint) (*domain.CodingCTOExpertSkillVersion, error)
	RunPlanningExperts(ctx context.Context, userID uint, req *domain.SpecForgeExpertPlanningRequest) (*domain.SpecForgeExpertPlanningBundle, error)
}

type store interface {
	UpsertExpert(ctx context.Context, expert *domain.CodingCTOExpert) error
	FindExpertByID(ctx context.Context, id uint) (*domain.CodingCTOExpert, error)
	ListExperts(ctx context.Context, activeOnly bool) ([]*domain.CodingCTOExpert, error)
	UpsertSkillWithVersion(ctx context.Context, skill *domain.CodingCTOExpertSkill, version *domain.CodingCTOExpertSkillVersion, promote bool) error
	CreateSkillVersion(ctx context.Context, version *domain.CodingCTOExpertSkillVersion, promote bool) error
	FindSkillByID(ctx context.Context, id uint) (*domain.CodingCTOExpertSkill, error)
	ListSkillsByExpertID(ctx context.Context, expertID uint) ([]*domain.CodingCTOExpertSkill, error)
	ListCurrentSkillsForExperts(ctx context.Context, expertIDs []uint, repositoryID string) ([]*domain.CodingCTOExpertSkill, error)
	ListSkillVersions(ctx context.Context, skillID uint) ([]*domain.CodingCTOExpertSkillVersion, error)
	CreateExpertRun(ctx context.Context, run *domain.CodingCTOExpertRun) error
	ListExpertRuns(ctx context.Context, expertID uint) ([]*domain.CodingCTOExpertRun, error)
	CreateEvolutionProposal(ctx context.Context, proposal *domain.CodingCTOSkillEvolutionProposal) error
	FindEvolutionProposalByID(ctx context.Context, id uint) (*domain.CodingCTOSkillEvolutionProposal, error)
	ListEvolutionProposalsBySkillID(ctx context.Context, skillID uint) ([]*domain.CodingCTOSkillEvolutionProposal, error)
	UpdateEvolutionProposal(ctx context.Context, proposal *domain.CodingCTOSkillEvolutionProposal) error
	PromoteProposal(ctx context.Context, proposal *domain.CodingCTOSkillEvolutionProposal, userID uint) (*domain.CodingCTOExpertSkillVersion, error)
}

type service struct {
	repo store
}

func NewService(repo *repository) *service {
	return &service{repo: repo}
}

func (s *service) ListExperts(ctx context.Context, activeOnly bool) ([]*domain.CodingCTOExpert, error) {
	if err := s.ensureDefaultExperts(ctx); err != nil {
		return nil, err
	}
	return s.repo.ListExperts(ctx, activeOnly)
}

func (s *service) UpsertExpert(ctx context.Context, userID uint, req *UpsertExpertRequest) (*domain.CodingCTOExpert, error) {
	if userID == 0 || req == nil || strings.TrimSpace(req.Key) == "" || strings.TrimSpace(req.SystemPrompt) == "" {
		return nil, domain.ErrInvalidInput
	}
	active := true
	if req.Active != nil {
		active = *req.Active
	}
	expert := &domain.CodingCTOExpert{
		Key:             slug(req.Key),
		Name:            strings.TrimSpace(req.Name),
		Role:            strings.TrimSpace(req.Role),
		Description:     strings.TrimSpace(req.Description),
		SystemPrompt:    strings.TrimSpace(req.SystemPrompt),
		DefaultProvider: defaultString(req.DefaultProvider, "deepseek"),
		DefaultModel:    strings.TrimSpace(req.DefaultModel),
		Active:          active,
		SortOrder:       req.SortOrder,
		CreatedBy:       userID,
	}
	if expert.Key == "" || expert.Name == "" || expert.Role == "" {
		return nil, domain.ErrInvalidInput
	}
	if err := s.repo.UpsertExpert(ctx, expert); err != nil {
		return nil, fmt.Errorf("upsert expert: %w", err)
	}
	return expert, nil
}

func (s *service) GetExpert(ctx context.Context, id uint) (*domain.CodingCTOExpert, error) {
	return s.repo.FindExpertByID(ctx, id)
}

func (s *service) ListExpertSkills(ctx context.Context, expertID uint) ([]*domain.CodingCTOExpertSkill, error) {
	return s.repo.ListSkillsByExpertID(ctx, expertID)
}

func (s *service) UpsertExpertSkill(ctx context.Context, userID, expertID uint, req *UpsertExpertSkillRequest) (*domain.CodingCTOExpertSkill, error) {
	if userID == 0 || expertID == 0 || req == nil || strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Content) == "" {
		return nil, domain.ErrInvalidInput
	}
	if _, err := s.repo.FindExpertByID(ctx, expertID); err != nil {
		return nil, err
	}
	active := true
	if req.Active != nil {
		active = *req.Active
	}
	skill := &domain.CodingCTOExpertSkill{
		ExpertID:     expertID,
		WorkspaceID:  strings.TrimSpace(req.WorkspaceID),
		ProjectID:    req.ProjectID,
		RepositoryID: strings.TrimSpace(req.RepositoryID),
		Name:         strings.TrimSpace(req.Name),
		Description:  strings.TrimSpace(req.Description),
		Active:       active,
		TargetAgents: normalizeTargets(req.TargetAgents),
		CreatedBy:    userID,
	}
	version := &domain.CodingCTOExpertSkillVersion{
		Content:       strings.TrimSpace(req.Content),
		ContentHash:   contentHash(strings.TrimSpace(req.Content)),
		ChangeSummary: strings.TrimSpace(req.ChangeSummary),
		Source:        "manual",
		CreatedBy:     userID,
	}
	if err := s.repo.UpsertSkillWithVersion(ctx, skill, version, true); err != nil {
		return nil, fmt.Errorf("upsert expert skill: %w", err)
	}
	skill.CurrentVersion = version
	return skill, nil
}

func (s *service) ListSkillVersions(ctx context.Context, skillID uint) ([]*domain.CodingCTOExpertSkillVersion, error) {
	return s.repo.ListSkillVersions(ctx, skillID)
}

func (s *service) CreateSkillVersion(ctx context.Context, userID, skillID uint, req *CreateExpertSkillVersionRequest) (*domain.CodingCTOExpertSkillVersion, error) {
	if userID == 0 || skillID == 0 || req == nil || strings.TrimSpace(req.Content) == "" {
		return nil, domain.ErrInvalidInput
	}
	if _, err := s.repo.FindSkillByID(ctx, skillID); err != nil {
		return nil, err
	}
	promote := true
	if req.Promote != nil {
		promote = *req.Promote
	}
	version := &domain.CodingCTOExpertSkillVersion{
		SkillID:       skillID,
		Content:       strings.TrimSpace(req.Content),
		ContentHash:   contentHash(strings.TrimSpace(req.Content)),
		ChangeSummary: strings.TrimSpace(req.ChangeSummary),
		Source:        defaultString(req.Source, "manual"),
		CreatedBy:     userID,
	}
	if err := s.repo.CreateSkillVersion(ctx, version, promote); err != nil {
		return nil, fmt.Errorf("create expert skill version: %w", err)
	}
	return version, nil
}

func (s *service) ListExpertRuns(ctx context.Context, expertID uint) ([]*domain.CodingCTOExpertRun, error) {
	return s.repo.ListExpertRuns(ctx, expertID)
}

func (s *service) CreateEvolutionProposal(ctx context.Context, userID, skillID uint, req *CreateEvolutionProposalRequest) (*domain.CodingCTOSkillEvolutionProposal, error) {
	if userID == 0 || skillID == 0 || req == nil || strings.TrimSpace(req.ProposedContent) == "" || strings.TrimSpace(req.Rationale) == "" {
		return nil, domain.ErrInvalidInput
	}
	skill, err := s.repo.FindSkillByID(ctx, skillID)
	if err != nil {
		return nil, err
	}
	if skill.CurrentVersionID == nil {
		return nil, domain.ErrInvalidInput
	}
	proposal := &domain.CodingCTOSkillEvolutionProposal{
		ExpertID:            skill.ExpertID,
		SkillID:             skill.ID,
		BaseVersionID:       *skill.CurrentVersionID,
		ProposedContent:     strings.TrimSpace(req.ProposedContent),
		ProposedContentHash: contentHash(strings.TrimSpace(req.ProposedContent)),
		Rationale:           strings.TrimSpace(req.Rationale),
		EvalNotes:           strings.TrimSpace(req.EvalNotes),
		Status:              domain.ExpertSkillProposalStatusPendingReview,
		CreatedBy:           userID,
	}
	if err := s.repo.CreateEvolutionProposal(ctx, proposal); err != nil {
		return nil, fmt.Errorf("create skill evolution proposal: %w", err)
	}
	return proposal, nil
}

func (s *service) ListEvolutionProposals(ctx context.Context, skillID uint) ([]*domain.CodingCTOSkillEvolutionProposal, error) {
	return s.repo.ListEvolutionProposalsBySkillID(ctx, skillID)
}

func (s *service) ApproveEvolutionProposal(ctx context.Context, userID, proposalID uint) (*domain.CodingCTOSkillEvolutionProposal, error) {
	return s.reviewProposal(ctx, userID, proposalID, domain.ExpertSkillProposalStatusApproved)
}

func (s *service) RejectEvolutionProposal(ctx context.Context, userID, proposalID uint) (*domain.CodingCTOSkillEvolutionProposal, error) {
	return s.reviewProposal(ctx, userID, proposalID, domain.ExpertSkillProposalStatusRejected)
}

func (s *service) PromoteEvolutionProposal(ctx context.Context, userID, proposalID uint) (*domain.CodingCTOExpertSkillVersion, error) {
	if userID == 0 || proposalID == 0 {
		return nil, domain.ErrInvalidInput
	}
	proposal, err := s.repo.FindEvolutionProposalByID(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.Status != domain.ExpertSkillProposalStatusApproved && proposal.Status != domain.ExpertSkillProposalStatusPendingReview {
		return nil, domain.ErrConflict
	}
	now := time.Now()
	proposal.ReviewedBy = &userID
	proposal.ReviewedAt = &now
	return s.repo.PromoteProposal(ctx, proposal, userID)
}

func (s *service) RunPlanningExperts(ctx context.Context, userID uint, req *domain.SpecForgeExpertPlanningRequest) (*domain.SpecForgeExpertPlanningBundle, error) {
	if userID == 0 || req == nil || len(req.ExpertIDs) == 0 {
		return &domain.SpecForgeExpertPlanningBundle{}, nil
	}
	expertIDs := uniqueUInts(req.ExpertIDs)
	skills, err := s.repo.ListCurrentSkillsForExperts(ctx, expertIDs, req.RepositoryID)
	if err != nil {
		return nil, fmt.Errorf("load expert skills: %w", err)
	}
	skillsByExpert := map[uint][]*domain.CodingCTOExpertSkill{}
	for _, skill := range skills {
		if skill == nil || skill.CurrentVersion == nil {
			continue
		}
		skillsByExpert[skill.ExpertID] = append(skillsByExpert[skill.ExpertID], skill)
	}
	bundle := &domain.SpecForgeExpertPlanningBundle{}
	for _, expertID := range expertIDs {
		expert, err := s.repo.FindExpertByID(ctx, expertID)
		if err != nil {
			return nil, err
		}
		if !expert.Active {
			continue
		}
		runSkills := skillsByExpert[expertID]
		refs := skillVersionRefs(runSkills)
		input := map[string]any{
			"idea":          strings.TrimSpace(req.Idea),
			"mode":          strings.TrimSpace(req.Mode),
			"repository_id": strings.TrimSpace(req.RepositoryID),
			"expert":        expert.Key,
			"skill_refs":    refs,
			"context":       req.Context,
		}
		output := map[string]any{
			"expert":      expert.Key,
			"summary":     fmt.Sprintf("%s reviewed the idea with %d current skill versions.", expert.Name, len(refs)),
			"constraints": skillConstraintSummaries(runSkills),
		}
		inputJSON := mustJSON(input)
		outputJSON := mustJSON(output)
		now := time.Now()
		run := &domain.CodingCTOExpertRun{
			ExpertID: expert.ID, RequirementID: req.RequirementID, PlanID: req.PlanID,
			RepositoryID: strings.TrimSpace(req.RepositoryID), InputJSON: inputJSON, OutputJSON: outputJSON,
			Provider: defaultString(expert.DefaultProvider, "internal"), Model: expert.DefaultModel,
			Status: domain.ExpertRunStatusCompleted, SkillVersionRefs: refs, StartedAt: &now, CompletedAt: &now,
			CreatedBy: userID,
		}
		if err := s.repo.CreateExpertRun(ctx, run); err != nil {
			return nil, fmt.Errorf("create expert run: %w", err)
		}
		bundle.Runs = append(bundle.Runs, run)
		bundle.SkillVersionRefs = append(bundle.SkillVersionRefs, refs...)
		bundle.OutputSummaries = append(bundle.OutputSummaries, fmt.Sprintf("%s:%s", agentcontract.FormatExpertRunRef(run.ID), expert.Key))
	}
	bundle.SkillVersionRefs = uniqueStrings(bundle.SkillVersionRefs)
	return bundle, nil
}

func (s *service) reviewProposal(ctx context.Context, userID, proposalID uint, status string) (*domain.CodingCTOSkillEvolutionProposal, error) {
	if userID == 0 || proposalID == 0 {
		return nil, domain.ErrInvalidInput
	}
	proposal, err := s.repo.FindEvolutionProposalByID(ctx, proposalID)
	if err != nil {
		return nil, err
	}
	if proposal.Status == domain.ExpertSkillProposalStatusPromoted {
		return nil, domain.ErrConflict
	}
	now := time.Now()
	proposal.Status = status
	proposal.ReviewedBy = &userID
	proposal.ReviewedAt = &now
	if err := s.repo.UpdateEvolutionProposal(ctx, proposal); err != nil {
		return nil, fmt.Errorf("review evolution proposal: %w", err)
	}
	return proposal, nil
}

func (s *service) ensureDefaultExperts(ctx context.Context) error {
	experts, err := s.repo.ListExperts(ctx, false)
	if err != nil {
		return err
	}
	if len(experts) > 0 {
		return nil
	}
	for _, seed := range defaultExperts() {
		expert := seed
		if err := s.repo.UpsertExpert(ctx, &expert); err != nil {
			return err
		}
	}
	return nil
}

func defaultExperts() []domain.CodingCTOExpert {
	return []domain.CodingCTOExpert{
		{Key: "product-requirements", Name: "Product Requirements Expert", Role: "product", Description: "Clarifies users, scope, acceptance criteria, non-goals, and open questions.", SystemPrompt: "Turn product ideas into concrete PRD constraints for reviewable implementation plans.", DefaultProvider: "internal", Active: true, SortOrder: 10},
		{Key: "architecture-impact", Name: "Architecture Impact Expert", Role: "architecture", Description: "Constrain module boundaries, API contracts, data flow, compatibility, and risks.", SystemPrompt: "Identify affected modules, API boundaries, data flow, risks, and migration constraints.", DefaultProvider: "internal", Active: true, SortOrder: 20},
		{Key: "qa-verification", Name: "QA Verification Expert", Role: "qa", Description: "Defines tests, quality gates, acceptance checks, and failure modes.", SystemPrompt: "Attach verification, test commands, and failure recovery to each implementation milestone.", DefaultProvider: "internal", Active: true, SortOrder: 30},
		{Key: "coding-agent-handoff", Name: "Coding Agent Handoff Expert", Role: "handoff", Description: "Makes the plan executable by a coding agent.", SystemPrompt: "Convert expert conclusions into PR-sized tasks with files, commands, non-goals, and review gates.", DefaultProvider: "internal", Active: true, SortOrder: 40},
	}
}

var slugPattern = regexp.MustCompile(`[^a-z0-9_-]+`)

func slug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = slugPattern.ReplaceAllString(value, "-")
	return strings.Trim(value, "-_")
}

func defaultString(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func normalizeTargets(values []string) []string {
	out := uniqueStrings(values)
	if len(out) == 0 {
		return []string{"planning"}
	}
	return out
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func uniqueUInts(values []uint) []uint {
	seen := map[uint]struct{}{}
	out := []uint{}
	for _, value := range values {
		if value == 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func skillVersionRefs(skills []*domain.CodingCTOExpertSkill) []string {
	refs := []string{}
	for _, skill := range skills {
		if skill == nil || skill.CurrentVersion == nil {
			continue
		}
		refs = append(refs, agentcontract.FormatSkillVersionRef(skill.ID, skill.CurrentVersion.Version))
	}
	return uniqueStrings(refs)
}

func skillConstraintSummaries(skills []*domain.CodingCTOExpertSkill) []string {
	out := []string{}
	for _, skill := range skills {
		if skill == nil || skill.CurrentVersion == nil {
			continue
		}
		out = append(out, fmt.Sprintf("%s: %s", skill.Name, skill.Description))
	}
	return uniqueStrings(out)
}

func mustJSON(value any) string {
	body, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(body)
}
