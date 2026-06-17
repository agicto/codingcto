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

	expertsByKey := map[string]*domain.CodingCTOExpert{}
	for _, expert := range experts {
		if expert == nil {
			continue
		}
		expertsByKey[expert.Key] = expert
	}

	for _, seed := range defaultExpertSeeds() {
		expert := expertsByKey[seed.Expert.Key]
		if expert == nil {
			expert = &domain.CodingCTOExpert{}
		}
		if expert.ID == 0 || shouldUpgradeDefaultExpert(expert, seed) {
			next := seed.Expert
			if err := s.repo.UpsertExpert(ctx, &next); err != nil {
				return err
			}
			expert = &next
		}
		if err := s.ensureDefaultExpertSkills(ctx, expert, seed.Skills); err != nil {
			return err
		}
	}
	return nil
}

func (s *service) ensureDefaultExpertSkills(ctx context.Context, expert *domain.CodingCTOExpert, seeds []defaultExpertSkillSeed) error {
	if expert == nil || expert.ID == 0 {
		return domain.ErrInvalidInput
	}
	skills, err := s.repo.ListSkillsByExpertID(ctx, expert.ID)
	if err != nil {
		return fmt.Errorf("list default expert skills: %w", err)
	}
	skillsByKey := map[string]*domain.CodingCTOExpertSkill{}
	for _, skill := range skills {
		if skill == nil {
			continue
		}
		skillsByKey[defaultExpertSkillKey(skill.Name, skill.RepositoryID)] = skill
	}
	for _, seed := range seeds {
		existing := skillsByKey[defaultExpertSkillKey(seed.Name, "")]
		if existing != nil && !isSystemDefaultSkill(existing) {
			continue
		}
		content := strings.TrimSpace(seed.Content)
		if existing != nil && existing.CurrentVersion != nil && existing.CurrentVersion.ContentHash == contentHash(content) {
			continue
		}
		skill := &domain.CodingCTOExpertSkill{
			ExpertID:     expert.ID,
			Name:         strings.TrimSpace(seed.Name),
			Description:  strings.TrimSpace(seed.Description),
			Active:       true,
			TargetAgents: normalizeTargets(seed.TargetAgents),
			CreatedBy:    0,
		}
		version := &domain.CodingCTOExpertSkillVersion{
			Content:       content,
			ContentHash:   contentHash(content),
			ChangeSummary: defaultString(seed.ChangeSummary, "Initial default expert skill."),
			Source:        defaultExpertSkillSource,
			CreatedBy:     0,
		}
		if err := s.repo.UpsertSkillWithVersion(ctx, skill, version, true); err != nil {
			return fmt.Errorf("upsert default expert skill %q: %w", seed.Name, err)
		}
	}
	return nil
}

func shouldUpgradeDefaultExpert(expert *domain.CodingCTOExpert, seed defaultExpertSeed) bool {
	if expert == nil || expert.CreatedBy != 0 {
		return false
	}
	return strings.TrimSpace(expert.Description) == seed.LegacyDescription &&
		strings.TrimSpace(expert.SystemPrompt) == seed.LegacySystemPrompt
}

func isSystemDefaultSkill(skill *domain.CodingCTOExpertSkill) bool {
	if skill == nil || skill.CreatedBy != 0 {
		return false
	}
	return skill.CurrentVersion == nil || skill.CurrentVersion.Source == defaultExpertSkillSource
}

func defaultExpertSkillKey(name, repositoryID string) string {
	return strings.ToLower(strings.TrimSpace(name)) + ":" + strings.TrimSpace(repositoryID)
}

type defaultExpertSeed struct {
	Expert             domain.CodingCTOExpert
	LegacyDescription  string
	LegacySystemPrompt string
	Skills             []defaultExpertSkillSeed
}

type defaultExpertSkillSeed struct {
	Name          string
	Description   string
	Content       string
	ChangeSummary string
	TargetAgents  []string
}

const defaultExpertSkillSource = "system"

var defaultExpertPlanningTargets = []string{"planning"}

func defaultExpertSeeds() []defaultExpertSeed {
	return []defaultExpertSeed{
		{
			Expert: domain.CodingCTOExpert{
				Key:             "product-requirements",
				Name:            "Product Requirements Expert",
				Role:            "product",
				Description:     "Turns product ideas into bounded requirements, acceptance criteria, non-goals, and reviewable product slices.",
				SystemPrompt:    defaultProductRequirementsPrompt(),
				DefaultProvider: "internal",
				Active:          true,
				SortOrder:       10,
			},
			LegacyDescription:  "Clarifies users, scope, acceptance criteria, non-goals, and open questions.",
			LegacySystemPrompt: "Turn product ideas into concrete PRD constraints for reviewable implementation plans.",
			Skills: []defaultExpertSkillSeed{
				{
					Name:          "Requirement Boundary Contract",
					Description:   "Defines users, jobs, goals, in-scope behavior, out-of-scope behavior, and unresolved product questions before implementation planning.",
					Content:       defaultRequirementBoundarySkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default requirement boundary skill.",
				},
				{
					Name:          "Acceptance Criteria Matrix",
					Description:   "Converts requirements into observable acceptance criteria with user-visible outcomes, data expectations, and review signals.",
					Content:       defaultAcceptanceCriteriaSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default acceptance criteria skill.",
				},
				{
					Name:          "Reviewable Product Slicing",
					Description:   "Splits product scope into PR-sized milestones that preserve user value without mixing unrelated behavior.",
					Content:       defaultProductSlicingSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default product slicing skill.",
				},
			},
		},
		{
			Expert: domain.CodingCTOExpert{
				Key:             "architecture-impact",
				Name:            "Architecture Impact Expert",
				Role:            "architecture",
				Description:     "Maps the technical change surface across modules, API contracts, data flow, integration boundaries, and rollout risks.",
				SystemPrompt:    defaultArchitectureImpactPrompt(),
				DefaultProvider: "internal",
				Active:          true,
				SortOrder:       20,
			},
			LegacyDescription:  "Constrain module boundaries, API contracts, data flow, compatibility, and risks.",
			LegacySystemPrompt: "Identify affected modules, API boundaries, data flow, risks, and migration constraints.",
			Skills: []defaultExpertSkillSeed{
				{
					Name:          "Change Surface Mapping",
					Description:   "Identifies affected modules, ownership boundaries, dependencies, entrypoints, and files that need evidence before edits.",
					Content:       defaultChangeSurfaceSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default change surface skill.",
				},
				{
					Name:          "API And Data Contract Review",
					Description:   "Reviews request and response contracts, domain entities, persistence changes, migrations, compatibility, and client impact.",
					Content:       defaultAPIDataContractSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default API and data contract skill.",
				},
				{
					Name:          "Migration And Rollout Risk",
					Description:   "Calls out rollout, migration, backfill, fallback, and compatibility risks before PR work starts.",
					Content:       defaultMigrationRolloutSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default migration and rollout risk skill.",
				},
			},
		},
		{
			Expert: domain.CodingCTOExpert{
				Key:             "qa-verification",
				Name:            "QA Verification Expert",
				Role:            "qa",
				Description:     "Builds verification strategy with automated tests, manual checks, CI gates, failure modes, and acceptance evidence.",
				SystemPrompt:    defaultQAVerificationPrompt(),
				DefaultProvider: "internal",
				Active:          true,
				SortOrder:       30,
			},
			LegacyDescription:  "Defines tests, quality gates, acceptance checks, and failure modes.",
			LegacySystemPrompt: "Attach verification, test commands, and failure recovery to each implementation milestone.",
			Skills: []defaultExpertSkillSeed{
				{
					Name:          "Verification Matrix",
					Description:   "Maps every behavior change to test type, command, expected signal, and acceptance evidence.",
					Content:       defaultVerificationMatrixSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default verification matrix skill.",
				},
				{
					Name:          "Failure Mode Coverage",
					Description:   "Identifies likely failure modes and requires explicit handling, regression tests, or escalation notes.",
					Content:       defaultFailureModeSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default failure mode coverage skill.",
				},
				{
					Name:          "CI And Manual Acceptance Gate",
					Description:   "Defines the smallest reliable CI, lint, type-check, browser, and manual checks needed before review.",
					Content:       defaultCIGateSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default CI and manual acceptance gate skill.",
				},
			},
		},
		{
			Expert: domain.CodingCTOExpert{
				Key:             "coding-agent-handoff",
				Name:            "Coding Agent Handoff Expert",
				Role:            "handoff",
				Description:     "Converts approved planning decisions into implementation-ready PR tasks with file scope, order, commands, and review package expectations.",
				SystemPrompt:    defaultCodingAgentHandoffPrompt(),
				DefaultProvider: "internal",
				Active:          true,
				SortOrder:       40,
			},
			LegacyDescription:  "Makes the plan executable by a coding agent.",
			LegacySystemPrompt: "Convert expert conclusions into PR-sized tasks with files, commands, non-goals, and review gates.",
			Skills: []defaultExpertSkillSeed{
				{
					Name:          "Implementation Handoff Contract",
					Description:   "Turns plan decisions into concrete implementation instructions with inputs, outputs, invariants, and stop conditions.",
					Content:       defaultImplementationHandoffSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default implementation handoff skill.",
				},
				{
					Name:          "File Scope And Sequencing",
					Description:   "Constrains likely file edits, PR order, dependencies, and boundaries so agents avoid broad unrelated refactors.",
					Content:       defaultFileScopeSequencingSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default file scope and sequencing skill.",
				},
				{
					Name:          "PR Review Package",
					Description:   "Requires implementation summaries, evidence refs, tests run, risks, and reviewer-facing notes for each PR.",
					Content:       defaultPRReviewPackageSkill(),
					TargetAgents:  defaultExpertPlanningTargets,
					ChangeSummary: "Seed default PR review package skill.",
				},
			},
		},
	}
}

func defaultProductRequirementsPrompt() string {
	return defaultExpertText(
		"You are the Product Requirements Expert for CodingCTO planning.",
		"Your job is to turn a rough product idea into clear product intent before engineering work is planned.",
		"Focus on users, jobs to be done, business outcome, in-scope behavior, explicit non-goals, acceptance criteria, and unresolved questions.",
		"Prefer small reviewable product slices over broad phases. A good slice should be understandable in one PR and testable by a reviewer.",
		"Do not invent market facts, user research, API behavior, or hidden requirements. If evidence is missing, mark it as an open question or assumption.",
		"Output product constraints that architecture, QA, and coding-agent handoff can consume without reinterpreting the original idea.",
	)
}

func defaultArchitectureImpactPrompt() string {
	return defaultExpertText(
		"You are the Architecture Impact Expert for CodingCTO planning.",
		"Your job is to identify the technical change surface before implementation begins.",
		"Map affected frontend features, backend modules, APIs, domain entities, persistence changes, data flow, integrations, migrations, and compatibility boundaries.",
		"Prefer narrow module-local changes and explicit contracts. Highlight cross-boundary edits, shared abstractions, security-sensitive paths, and migration risk.",
		"Do not prescribe broad rewrites unless the requirement cannot be met safely without them. Escalate unclear ownership or missing repository evidence.",
		"Output architecture constraints that can be attached to reviewable PR nodes and prompt guardrails.",
	)
}

func defaultQAVerificationPrompt() string {
	return defaultExpertText(
		"You are the QA Verification Expert for CodingCTO planning.",
		"Your job is to make every planned change provable before code is dispatched or reviewed.",
		"Define the smallest reliable verification set: unit tests, integration tests, type checks, lint, browser checks, CI checks, and manual acceptance checks.",
		"Connect tests to user-visible behavior, data contract behavior, failure modes, regressions, and edge cases.",
		"Do not accept vague guidance such as 'add tests' or 'verify manually'. Name the command, signal, or reviewer observation whenever possible.",
		"Output verification constraints that can become PR node test commands and merge readiness gates.",
	)
}

func defaultCodingAgentHandoffPrompt() string {
	return defaultExpertText(
		"You are the Coding Agent Handoff Expert for CodingCTO planning.",
		"Your job is to convert approved product, architecture, and QA decisions into implementation-ready work for a coding agent.",
		"Each handoff must include likely files or folders, expected edits, sequencing, dependencies, non-goals, validation commands, and review notes.",
		"Optimize for small PRs that a coding agent can complete without guessing product intent or crossing unapproved boundaries.",
		"Stop and escalate when scope, evidence, repository readiness, or required tests are missing.",
		"Output concise execution constraints that help the agent implement exactly the planned PR node and no unrelated work.",
	)
}

func defaultRequirementBoundarySkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: Requirement Boundary Contract.",
		"Before planning implementation, produce a requirement boundary with these fields: target user, user goal, current pain, desired behavior, in-scope items, out-of-scope items, assumptions, and open questions.",
		"Translate broad wording into observable behavior. If the idea says 'improve', 'support', or 'make better', define the concrete state or interaction that changes.",
		"Separate product decisions from engineering decisions. Do not turn implementation guesses into requirements.",
		"Flag anything that would change authentication, billing, permissions, data retention, destructive actions, or external integrations as requiring explicit approval.",
	)
}

func defaultAcceptanceCriteriaSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: Acceptance Criteria Matrix.",
		"For each in-scope behavior, define acceptance criteria in observable terms: trigger, user action or system event, expected result, data state, and negative case.",
		"Criteria must be testable by a reviewer without reading model reasoning. Avoid subjective phrasing such as 'works well' or 'is intuitive'.",
		"Include at least one failure or empty-state criterion when the feature touches input, loading, permissions, external services, or generated output.",
		"Attach criteria to milestones so every PR has reviewable product value.",
	)
}

func defaultProductSlicingSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: Reviewable Product Slicing.",
		"Split work into the smallest PR-sized product milestones that preserve user value and reviewer confidence.",
		"Each slice must have a clear user-facing or operator-facing outcome, explicit non-goals, and a reason it can be reviewed independently.",
		"Do not combine unrelated UI, API, migration, settings, and execution behavior in one slice unless the dependency is unavoidable.",
		"When a slice depends on earlier work, name the dependency and the evidence that proves it is complete.",
	)
}

func defaultChangeSurfaceSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: Change Surface Mapping.",
		"Map the likely change surface before implementation: routes, components, services, handlers, domain entities, repositories, migrations, config, background jobs, and integration boundaries.",
		"For each affected area, state whether it is read-only context, write scope, or review-only evidence.",
		"Prefer existing module boundaries and local patterns. Mark broad shared abstractions, generated code, dependency locks, and global styling as high-friction areas unless explicitly required.",
		"Escalate when repository evidence is missing, stale, or contradictory.",
	)
}

func defaultAPIDataContractSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: API And Data Contract Review.",
		"Identify any API, DTO, domain, database, event, or frontend contract that could change.",
		"For each contract, define the compatibility expectation: unchanged, additive, breaking, migration required, backfill required, or unknown.",
		"Require explicit request and response fields for new API behavior. Require validation and error behavior for user input, permissions, and external failures.",
		"Do not allow frontend-only state to invent backend business states when a backend source of truth exists.",
	)
}

func defaultMigrationRolloutSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: Migration And Rollout Risk.",
		"Call out migrations, backfills, data defaults, versioning, feature flags, rollout sequencing, rollback behavior, and compatibility risks.",
		"If a database or persisted contract changes, require a migration order and a validation signal.",
		"If a change touches user-generated content, execution state, GitHub integration, runtime dispatch, or secrets, require an explicit failure and recovery path.",
		"Prefer reversible, additive rollout steps when feasible.",
	)
}

func defaultVerificationMatrixSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: Verification Matrix.",
		"Build a verification matrix that maps each behavior or contract change to a test type, command, expected signal, and evidence owner.",
		"Cover unit-level behavior, integration behavior, UI behavior, API validation, and prompt or generated-output contracts when relevant.",
		"Use repository-known commands when available. If commands are unknown, require the implementer to inspect local package scripts or Makefile before selecting the smallest relevant check.",
		"Every PR milestone must include at least one concrete validation signal or an explicit blocker.",
	)
}

func defaultFailureModeSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: Failure Mode Coverage.",
		"List likely failure modes before implementation: invalid input, empty data, permission denial, stale context, provider failure, network failure, race conditions, migration mismatch, and partial completion.",
		"For each relevant failure mode, require either a test, UI/API error handling, retry path, fallback, or documented escalation.",
		"Pay special attention to generated plans, prompt compilation, GitHub actions, runtime execution, and merge readiness because failures there can create unsafe PR output.",
	)
}

func defaultCIGateSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: CI And Manual Acceptance Gate.",
		"Define the minimum checks before review: format or lint, type check or compile, unit tests, integration tests, browser verification, and manual acceptance where applicable.",
		"Name exact commands when repository evidence provides them. Otherwise, name the file or manifest the agent must inspect to discover the command.",
		"Require test output or an explicit blocker in the PR summary. Do not mark a PR ready when required commands are skipped without explanation.",
	)
}

func defaultImplementationHandoffSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: Implementation Handoff Contract.",
		"Convert planning decisions into a handoff with goal, inputs, expected outputs, likely files, allowed scope, forbidden scope, sequencing, validation, and stop conditions.",
		"The coding agent should be able to start without asking what product decision to make. Any remaining product or architecture decision must become an explicit blocker.",
		"Keep instructions scoped to one PR node. Do not include downstream work except as dependencies or follow-up notes.",
	)
}

func defaultFileScopeSequencingSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: File Scope And Sequencing.",
		"Name likely files or folders to inspect and edit, then classify them as primary edit scope, supporting read scope, or avoid unless escalated.",
		"Sequence work so the agent can validate each step: contract first, domain or service behavior next, UI or integration next, tests and review package last.",
		"Prevent broad refactors. If a diff would cross more modules than planned, require the agent to stop and request a narrower plan or a new PR node.",
	)
}

func defaultPRReviewPackageSkill() string {
	return defaultExpertText(
		"Use this exact skill name in expert_skills: PR Review Package.",
		"Require each PR output to include a concise summary, scope, non-goals, evidence refs used, files changed, tests run, skipped checks with blockers, and remaining risk.",
		"Require reviewer notes for behavior that is hard to infer from the diff, such as generated prompt changes, compatibility assumptions, migrations, or UI state changes.",
		"The PR package must make it clear why the work is reviewable and what has deliberately not been changed.",
	)
}

func defaultExpertText(lines ...string) string {
	return strings.Join(lines, "\n")
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
