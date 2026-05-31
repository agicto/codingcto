package planning

import (
	"encoding/json"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type IdeaPO struct {
	ID            uint   `gorm:"primaryKey"`
	RequirementID *uint  `gorm:"index"`
	ProjectID     *uint  `gorm:"index"`
	RepositoryID  string `gorm:"size:255;not null;index"`
	CreatedBy     uint   `gorm:"not null;index"`
	RawInput      string `gorm:"type:text;not null"`
	Type          string `gorm:"size:50;not null;index"`
	Status        string `gorm:"size:50;not null;index"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (IdeaPO) TableName() string {
	return "specforge_ideas"
}

type RequirementPO struct {
	ID          uint   `gorm:"primaryKey"`
	WorkspaceID string `gorm:"size:255;not null;index"`
	ProjectID   uint   `gorm:"not null;index"`
	CreatedBy   uint   `gorm:"not null;index"`
	RawInput    string `gorm:"type:text;not null"`
	Type        string `gorm:"size:50;not null;index"`
	Status      string `gorm:"size:50;not null;index"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (RequirementPO) TableName() string {
	return "specforge_requirements"
}

type ProductSpecPO struct {
	ID                 uint   `gorm:"primaryKey"`
	IdeaID             uint   `gorm:"not null;uniqueIndex"`
	Goals              string `gorm:"type:text"`
	UserStories        string `gorm:"type:text"`
	BusinessRules      string `gorm:"type:text"`
	PermissionRules    string `gorm:"type:text"`
	EdgeCases          string `gorm:"type:text"`
	NonGoals           string `gorm:"type:text"`
	AcceptanceCriteria string `gorm:"type:text"`
	Assumptions        string `gorm:"type:text"`
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

func (ProductSpecPO) TableName() string {
	return "specforge_product_specs"
}

type ImplementationPlanPO struct {
	ID                   uint   `gorm:"primaryKey"`
	RequirementID        *uint  `gorm:"index:idx_specforge_plan_requirement_version"`
	IdeaID               uint   `gorm:"not null;uniqueIndex"`
	ProductSpecID        uint   `gorm:"not null;index"`
	Version              int    `gorm:"not null;default:1;index:idx_specforge_plan_requirement_version"`
	TechnicalSummary     string `gorm:"type:text;not null"`
	AffectedAreas        string `gorm:"type:text"`
	DataModelChanges     string `gorm:"type:text"`
	APIChanges           string `gorm:"type:text"`
	UIChanges            string `gorm:"type:text"`
	TestStrategy         string `gorm:"type:text"`
	SecurityRisks        string `gorm:"type:text"`
	MigrationRisks       string `gorm:"type:text"`
	Status               string `gorm:"size:50;not null;index"`
	ApprovedBy           *uint
	ApprovedAt           *time.Time
	ApprovedSnapshotHash string `gorm:"size:64;index"`
	ApprovedSnapshotAt   *time.Time
	DecisionOverrides    string `gorm:"type:text"`
	EvidenceRefs         string `gorm:"type:text"`
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

func (ImplementationPlanPO) TableName() string {
	return "specforge_implementation_plans"
}

type PRNodePO struct {
	ID                 uint   `gorm:"primaryKey"`
	PlanID             uint   `gorm:"not null;index"`
	RepositoryID       string `gorm:"size:255;index"`
	NodeKey            string `gorm:"size:50;not null;index"`
	Order              int    `gorm:"not null;index"`
	Title              string `gorm:"size:255;not null"`
	Type               string `gorm:"size:50;not null;index"`
	Goal               string `gorm:"type:text;not null"`
	DependsOn          string `gorm:"type:text"`
	EstimatedRisk      string `gorm:"size:50;not null"`
	ExpectedFiles      string `gorm:"type:text"`
	NonGoals           string `gorm:"type:text"`
	AcceptanceCriteria string `gorm:"type:text"`
	TestCommands       string `gorm:"type:text"`
	BranchName         string `gorm:"size:255;not null"`
	GitHubPRNumber     *int   `gorm:"column:github_pr_number;index"`
	GitHubPRURL        string `gorm:"column:github_pr_url;size:511"`
	GitHubHeadSHA      string `gorm:"column:github_head_sha;size:100;index"`
	Status             string `gorm:"size:50;not null;index"`
	EvidenceRefs       string `gorm:"type:text"`
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

func (PRNodePO) TableName() string {
	return "specforge_pr_nodes"
}

type CompiledPromptPO struct {
	ID           uint   `gorm:"primaryKey"`
	PRNodeID     uint   `gorm:"not null;index"`
	PlanID       uint   `gorm:"not null;index"`
	Type         string `gorm:"size:50;not null;index"`
	Version      string `gorm:"size:50;not null"`
	PromptText   string `gorm:"type:text;not null"`
	PromptHash   string `gorm:"size:64;not null;index"`
	EvidenceRefs string `gorm:"type:text"`
	CreatedBy    uint   `gorm:"not null;index"`
	CreatedAt    time.Time
}

func (CompiledPromptPO) TableName() string {
	return "specforge_compiled_prompts"
}

type SkillPO struct {
	ID           uint   `gorm:"primaryKey"`
	RepositoryID string `gorm:"size:255;not null;uniqueIndex:idx_specforge_skill_repo_name"`
	Name         string `gorm:"size:120;not null;uniqueIndex:idx_specforge_skill_repo_name"`
	Description  string `gorm:"type:text"`
	Content      string `gorm:"type:text;not null"`
	Active       bool   `gorm:"not null;default:true;index"`
	TargetAgents string `gorm:"column:target_agents;type:text;not null;default:'[]'"`
	CreatedBy    uint   `gorm:"not null;index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (SkillPO) TableName() string {
	return "specforge_skills"
}

type ProjectSkillPO struct {
	ID           uint   `gorm:"primaryKey"`
	WorkspaceID  string `gorm:"size:255;not null;index"`
	ProjectID    uint   `gorm:"not null;uniqueIndex:idx_specforge_project_skill"`
	RepositoryID string `gorm:"size:255;not null;index"`
	SkillID      uint   `gorm:"not null;uniqueIndex:idx_specforge_project_skill"`
	Active       bool   `gorm:"not null;default:true;index"`
	SortOrder    int    `gorm:"not null;default:0;index"`
	CreatedBy    uint   `gorm:"not null;index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
	Skill        *SkillPO `gorm:"foreignKey:SkillID"`
}

func (ProjectSkillPO) TableName() string {
	return "specforge_project_skills"
}

type SkillRunPO struct {
	ID            uint   `gorm:"primaryKey"`
	RequirementID *uint  `gorm:"index"`
	PlanID        *uint  `gorm:"index"`
	ProjectID     *uint  `gorm:"index"`
	SkillID       *uint  `gorm:"index"`
	Stage         string `gorm:"size:80;not null;index"`
	Status        string `gorm:"size:50;not null;index"`
	InputSummary  string `gorm:"type:text"`
	OutputSummary string `gorm:"type:text"`
	OutputJSON    string `gorm:"type:text"`
	EvidenceRefs  string `gorm:"type:text"`
	ErrorMessage  string `gorm:"type:text"`
	StartedAt     *time.Time
	CompletedAt   *time.Time
	CreatedBy     uint `gorm:"not null;index"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
	Skill         *SkillPO `gorm:"foreignKey:SkillID"`
}

func (SkillRunPO) TableName() string {
	return "specforge_skill_runs"
}

func newIdeaPO(idea *domain.SpecForgeIdea) *IdeaPO {
	return &IdeaPO{
		ID: idea.ID, RequirementID: idea.RequirementID, ProjectID: idea.ProjectID, RepositoryID: idea.RepositoryID, CreatedBy: idea.CreatedBy,
		RawInput: idea.RawInput, Type: idea.Type, Status: idea.Status,
		CreatedAt: idea.CreatedAt, UpdatedAt: idea.UpdatedAt,
	}
}

func (po *IdeaPO) toDomain() *domain.SpecForgeIdea {
	return &domain.SpecForgeIdea{
		ID: po.ID, RequirementID: po.RequirementID, ProjectID: po.ProjectID, RepositoryID: po.RepositoryID, CreatedBy: po.CreatedBy,
		RawInput: po.RawInput, Type: po.Type, Status: po.Status,
		CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
	}
}

func newRequirementPO(requirement *domain.SpecForgeRequirement) *RequirementPO {
	return &RequirementPO{
		ID:          requirement.ID,
		WorkspaceID: requirement.WorkspaceID,
		ProjectID:   requirement.ProjectID,
		CreatedBy:   requirement.CreatedBy,
		RawInput:    requirement.RawInput,
		Type:        requirement.Type,
		Status:      requirement.Status,
		CreatedAt:   requirement.CreatedAt,
		UpdatedAt:   requirement.UpdatedAt,
	}
}

func (po *RequirementPO) toDomain() *domain.SpecForgeRequirement {
	return &domain.SpecForgeRequirement{
		ID:          po.ID,
		WorkspaceID: po.WorkspaceID,
		ProjectID:   po.ProjectID,
		CreatedBy:   po.CreatedBy,
		RawInput:    po.RawInput,
		Type:        po.Type,
		Status:      po.Status,
		CreatedAt:   po.CreatedAt,
		UpdatedAt:   po.UpdatedAt,
	}
}

func newProductSpecPO(spec *domain.SpecForgeProductSpec) *ProductSpecPO {
	return &ProductSpecPO{
		ID: spec.ID, IdeaID: spec.IdeaID, Goals: encodeStrings(spec.Goals),
		UserStories: encodeStrings(spec.UserStories), BusinessRules: encodeStrings(spec.BusinessRules),
		PermissionRules: encodeStrings(spec.PermissionRules), EdgeCases: encodeStrings(spec.EdgeCases),
		NonGoals: encodeStrings(spec.NonGoals), AcceptanceCriteria: encodeStrings(spec.AcceptanceCriteria),
		Assumptions: encodeStrings(spec.Assumptions), CreatedAt: spec.CreatedAt, UpdatedAt: spec.UpdatedAt,
	}
}

func (po *ProductSpecPO) toDomain() *domain.SpecForgeProductSpec {
	return &domain.SpecForgeProductSpec{
		ID: po.ID, IdeaID: po.IdeaID, Goals: decodeStrings(po.Goals),
		UserStories: decodeStrings(po.UserStories), BusinessRules: decodeStrings(po.BusinessRules),
		PermissionRules: decodeStrings(po.PermissionRules), EdgeCases: decodeStrings(po.EdgeCases),
		NonGoals: decodeStrings(po.NonGoals), AcceptanceCriteria: decodeStrings(po.AcceptanceCriteria),
		Assumptions: decodeStrings(po.Assumptions), CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
	}
}

func newImplementationPlanPO(plan *domain.SpecForgeImplementationPlan) *ImplementationPlanPO {
	return &ImplementationPlanPO{
		ID: plan.ID, RequirementID: plan.RequirementID, IdeaID: plan.IdeaID, ProductSpecID: plan.ProductSpecID,
		Version:          plan.Version,
		TechnicalSummary: plan.TechnicalSummary, AffectedAreas: encodeStrings(plan.AffectedAreas),
		DataModelChanges: encodeStrings(plan.DataModelChanges), APIChanges: encodeStrings(plan.APIChanges),
		UIChanges: encodeStrings(plan.UIChanges), TestStrategy: encodeStrings(plan.TestStrategy),
		SecurityRisks: encodeStrings(plan.SecurityRisks), MigrationRisks: encodeStrings(plan.MigrationRisks),
		Status: plan.Status, ApprovedBy: plan.ApprovedBy, ApprovedAt: plan.ApprovedAt,
		ApprovedSnapshotHash: plan.ApprovedSnapshotHash, ApprovedSnapshotAt: plan.ApprovedSnapshotAt,
		DecisionOverrides: encodeStrings(plan.DecisionOverrides), EvidenceRefs: encodeStrings(plan.EvidenceRefs),
		CreatedAt: plan.CreatedAt, UpdatedAt: plan.UpdatedAt,
	}
}

func (po *ImplementationPlanPO) toDomain() *domain.SpecForgeImplementationPlan {
	return &domain.SpecForgeImplementationPlan{
		ID: po.ID, RequirementID: po.RequirementID, IdeaID: po.IdeaID, ProductSpecID: po.ProductSpecID,
		Version:          po.Version,
		TechnicalSummary: po.TechnicalSummary, AffectedAreas: decodeStrings(po.AffectedAreas),
		DataModelChanges: decodeStrings(po.DataModelChanges), APIChanges: decodeStrings(po.APIChanges),
		UIChanges: decodeStrings(po.UIChanges), TestStrategy: decodeStrings(po.TestStrategy),
		SecurityRisks: decodeStrings(po.SecurityRisks), MigrationRisks: decodeStrings(po.MigrationRisks),
		Status: po.Status, ApprovedBy: po.ApprovedBy, ApprovedAt: po.ApprovedAt,
		ApprovedSnapshotHash: po.ApprovedSnapshotHash, ApprovedSnapshotAt: po.ApprovedSnapshotAt,
		DecisionOverrides: decodeStrings(po.DecisionOverrides), EvidenceRefs: decodeStrings(po.EvidenceRefs),
		CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
	}
}

func newPRNodePO(node *domain.SpecForgePRNode) *PRNodePO {
	return &PRNodePO{
		ID: node.ID, PlanID: node.PlanID, RepositoryID: node.RepositoryID, NodeKey: node.NodeKey, Order: node.Order,
		Title: node.Title, Type: node.Type, Goal: node.Goal, DependsOn: encodeStrings(node.DependsOn),
		EstimatedRisk: node.EstimatedRisk, ExpectedFiles: encodeStrings(node.ExpectedFiles),
		NonGoals: encodeStrings(node.NonGoals), AcceptanceCriteria: encodeStrings(node.AcceptanceCriteria),
		TestCommands: encodeStrings(node.TestCommands), BranchName: node.BranchName,
		GitHubPRNumber: node.GitHubPRNumber, GitHubPRURL: node.GitHubPRURL, GitHubHeadSHA: node.GitHubHeadSHA,
		Status: node.Status, EvidenceRefs: encodeStrings(node.EvidenceRefs), CreatedAt: node.CreatedAt, UpdatedAt: node.UpdatedAt,
	}
}

func (po *PRNodePO) toDomain() *domain.SpecForgePRNode {
	return &domain.SpecForgePRNode{
		ID: po.ID, PlanID: po.PlanID, RepositoryID: po.RepositoryID, NodeKey: po.NodeKey, Order: po.Order,
		Title: po.Title, Type: po.Type, Goal: po.Goal, DependsOn: decodeStrings(po.DependsOn),
		EstimatedRisk: po.EstimatedRisk, ExpectedFiles: decodeStrings(po.ExpectedFiles),
		NonGoals: decodeStrings(po.NonGoals), AcceptanceCriteria: decodeStrings(po.AcceptanceCriteria),
		TestCommands: decodeStrings(po.TestCommands), BranchName: po.BranchName,
		GitHubPRNumber: po.GitHubPRNumber, GitHubPRURL: po.GitHubPRURL, GitHubHeadSHA: po.GitHubHeadSHA,
		Status: po.Status, EvidenceRefs: decodeStrings(po.EvidenceRefs), CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
	}
}

func newCompiledPromptPO(prompt *domain.SpecForgeCompiledPrompt) *CompiledPromptPO {
	return &CompiledPromptPO{
		ID:           prompt.ID,
		PRNodeID:     prompt.PRNodeID,
		PlanID:       prompt.PlanID,
		Type:         prompt.Type,
		Version:      prompt.Version,
		PromptText:   prompt.PromptText,
		PromptHash:   prompt.PromptHash,
		EvidenceRefs: encodeStrings(prompt.EvidenceRefs),
		CreatedBy:    prompt.CreatedBy,
		CreatedAt:    prompt.CreatedAt,
	}
}

func (po *CompiledPromptPO) toDomain() *domain.SpecForgeCompiledPrompt {
	return &domain.SpecForgeCompiledPrompt{
		ID:           po.ID,
		PRNodeID:     po.PRNodeID,
		PlanID:       po.PlanID,
		Type:         po.Type,
		Version:      po.Version,
		PromptText:   po.PromptText,
		PromptHash:   po.PromptHash,
		EvidenceRefs: decodeStrings(po.EvidenceRefs),
		CreatedBy:    po.CreatedBy,
		CreatedAt:    po.CreatedAt,
	}
}

func newSkillPO(skill *domain.SpecForgeSkill) *SkillPO {
	return &SkillPO{
		ID:           skill.ID,
		RepositoryID: skill.RepositoryID,
		Name:         skill.Name,
		Description:  skill.Description,
		Content:      skill.Content,
		Active:       skill.Active,
		TargetAgents: encodeStrings(skill.TargetAgents),
		CreatedBy:    skill.CreatedBy,
		CreatedAt:    skill.CreatedAt,
		UpdatedAt:    skill.UpdatedAt,
	}
}

func (po *SkillPO) toDomain() *domain.SpecForgeSkill {
	return &domain.SpecForgeSkill{
		ID:           po.ID,
		RepositoryID: po.RepositoryID,
		Name:         po.Name,
		Description:  po.Description,
		Content:      po.Content,
		Active:       po.Active,
		TargetAgents: decodeStrings(po.TargetAgents),
		CreatedBy:    po.CreatedBy,
		CreatedAt:    po.CreatedAt,
		UpdatedAt:    po.UpdatedAt,
	}
}

func newProjectSkillPO(projectSkill *domain.SpecForgeProjectSkill) *ProjectSkillPO {
	return &ProjectSkillPO{
		ID:           projectSkill.ID,
		WorkspaceID:  projectSkill.WorkspaceID,
		ProjectID:    projectSkill.ProjectID,
		RepositoryID: projectSkill.RepositoryID,
		SkillID:      projectSkill.SkillID,
		Active:       projectSkill.Active,
		SortOrder:    projectSkill.SortOrder,
		CreatedBy:    projectSkill.CreatedBy,
		CreatedAt:    projectSkill.CreatedAt,
		UpdatedAt:    projectSkill.UpdatedAt,
	}
}

func (po *ProjectSkillPO) toDomain() *domain.SpecForgeProjectSkill {
	var skill *domain.SpecForgeSkill
	if po.Skill != nil {
		skill = po.Skill.toDomain()
	}
	return &domain.SpecForgeProjectSkill{
		ID:           po.ID,
		WorkspaceID:  po.WorkspaceID,
		ProjectID:    po.ProjectID,
		RepositoryID: po.RepositoryID,
		SkillID:      po.SkillID,
		Active:       po.Active,
		SortOrder:    po.SortOrder,
		CreatedBy:    po.CreatedBy,
		CreatedAt:    po.CreatedAt,
		UpdatedAt:    po.UpdatedAt,
		Skill:        skill,
	}
}

func newSkillRunPO(run *domain.SpecForgeSkillRun) *SkillRunPO {
	return &SkillRunPO{
		ID:            run.ID,
		RequirementID: run.RequirementID,
		PlanID:        run.PlanID,
		ProjectID:     run.ProjectID,
		SkillID:       run.SkillID,
		Stage:         run.Stage,
		Status:        run.Status,
		InputSummary:  run.InputSummary,
		OutputSummary: run.OutputSummary,
		OutputJSON:    run.OutputJSON,
		EvidenceRefs:  encodeStrings(run.EvidenceRefs),
		ErrorMessage:  run.ErrorMessage,
		StartedAt:     run.StartedAt,
		CompletedAt:   run.CompletedAt,
		CreatedBy:     run.CreatedBy,
		CreatedAt:     run.CreatedAt,
		UpdatedAt:     run.UpdatedAt,
	}
}

func (po *SkillRunPO) toDomain() *domain.SpecForgeSkillRun {
	return &domain.SpecForgeSkillRun{
		ID:            po.ID,
		RequirementID: po.RequirementID,
		PlanID:        po.PlanID,
		ProjectID:     po.ProjectID,
		SkillID:       po.SkillID,
		Stage:         po.Stage,
		Status:        po.Status,
		InputSummary:  po.InputSummary,
		OutputSummary: po.OutputSummary,
		OutputJSON:    po.OutputJSON,
		EvidenceRefs:  decodeStrings(po.EvidenceRefs),
		ErrorMessage:  po.ErrorMessage,
		StartedAt:     po.StartedAt,
		CompletedAt:   po.CompletedAt,
		CreatedBy:     po.CreatedBy,
		CreatedAt:     po.CreatedAt,
		UpdatedAt:     po.UpdatedAt,
	}
}

func encodeStrings(values []string) string {
	if values == nil {
		values = []string{}
	}
	b, _ := json.Marshal(values)
	return string(b)
}

func decodeStrings(value string) []string {
	if value == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return []string{}
	}
	return out
}
