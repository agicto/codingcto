package planning

import (
	"encoding/json"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type IdeaPO struct {
	ID           uint   `gorm:"primaryKey"`
	RepositoryID string `gorm:"size:255;not null;index"`
	CreatedBy    uint   `gorm:"not null;index"`
	RawInput     string `gorm:"type:text;not null"`
	Type         string `gorm:"size:50;not null;index"`
	Status       string `gorm:"size:50;not null;index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (IdeaPO) TableName() string {
	return "specforge_ideas"
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
	ID                uint   `gorm:"primaryKey"`
	IdeaID            uint   `gorm:"not null;uniqueIndex"`
	ProductSpecID     uint   `gorm:"not null;index"`
	TechnicalSummary  string `gorm:"type:text;not null"`
	AffectedAreas     string `gorm:"type:text"`
	DataModelChanges  string `gorm:"type:text"`
	APIChanges        string `gorm:"type:text"`
	UIChanges         string `gorm:"type:text"`
	TestStrategy      string `gorm:"type:text"`
	SecurityRisks     string `gorm:"type:text"`
	MigrationRisks    string `gorm:"type:text"`
	Status            string `gorm:"size:50;not null;index"`
	ApprovedBy        *uint
	ApprovedAt        *time.Time
	DecisionOverrides string `gorm:"type:text"`
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (ImplementationPlanPO) TableName() string {
	return "specforge_implementation_plans"
}

type PRNodePO struct {
	ID                 uint   `gorm:"primaryKey"`
	PlanID             uint   `gorm:"not null;index"`
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
	Status             string `gorm:"size:50;not null;index"`
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

func (PRNodePO) TableName() string {
	return "specforge_pr_nodes"
}

type CompiledPromptPO struct {
	ID         uint   `gorm:"primaryKey"`
	PRNodeID   uint   `gorm:"not null;index"`
	PlanID     uint   `gorm:"not null;index"`
	Type       string `gorm:"size:50;not null;index"`
	Version    string `gorm:"size:50;not null"`
	PromptText string `gorm:"type:text;not null"`
	PromptHash string `gorm:"size:64;not null;index"`
	CreatedBy  uint   `gorm:"not null;index"`
	CreatedAt  time.Time
}

func (CompiledPromptPO) TableName() string {
	return "specforge_compiled_prompts"
}

func newIdeaPO(idea *domain.SpecForgeIdea) *IdeaPO {
	return &IdeaPO{
		ID: idea.ID, RepositoryID: idea.RepositoryID, CreatedBy: idea.CreatedBy,
		RawInput: idea.RawInput, Type: idea.Type, Status: idea.Status,
		CreatedAt: idea.CreatedAt, UpdatedAt: idea.UpdatedAt,
	}
}

func (po *IdeaPO) toDomain() *domain.SpecForgeIdea {
	return &domain.SpecForgeIdea{
		ID: po.ID, RepositoryID: po.RepositoryID, CreatedBy: po.CreatedBy,
		RawInput: po.RawInput, Type: po.Type, Status: po.Status,
		CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
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
		ID: plan.ID, IdeaID: plan.IdeaID, ProductSpecID: plan.ProductSpecID,
		TechnicalSummary: plan.TechnicalSummary, AffectedAreas: encodeStrings(plan.AffectedAreas),
		DataModelChanges: encodeStrings(plan.DataModelChanges), APIChanges: encodeStrings(plan.APIChanges),
		UIChanges: encodeStrings(plan.UIChanges), TestStrategy: encodeStrings(plan.TestStrategy),
		SecurityRisks: encodeStrings(plan.SecurityRisks), MigrationRisks: encodeStrings(plan.MigrationRisks),
		Status: plan.Status, ApprovedBy: plan.ApprovedBy, ApprovedAt: plan.ApprovedAt,
		DecisionOverrides: encodeStrings(plan.DecisionOverrides), CreatedAt: plan.CreatedAt, UpdatedAt: plan.UpdatedAt,
	}
}

func (po *ImplementationPlanPO) toDomain() *domain.SpecForgeImplementationPlan {
	return &domain.SpecForgeImplementationPlan{
		ID: po.ID, IdeaID: po.IdeaID, ProductSpecID: po.ProductSpecID,
		TechnicalSummary: po.TechnicalSummary, AffectedAreas: decodeStrings(po.AffectedAreas),
		DataModelChanges: decodeStrings(po.DataModelChanges), APIChanges: decodeStrings(po.APIChanges),
		UIChanges: decodeStrings(po.UIChanges), TestStrategy: decodeStrings(po.TestStrategy),
		SecurityRisks: decodeStrings(po.SecurityRisks), MigrationRisks: decodeStrings(po.MigrationRisks),
		Status: po.Status, ApprovedBy: po.ApprovedBy, ApprovedAt: po.ApprovedAt,
		DecisionOverrides: decodeStrings(po.DecisionOverrides), CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
	}
}

func newPRNodePO(node *domain.SpecForgePRNode) *PRNodePO {
	return &PRNodePO{
		ID: node.ID, PlanID: node.PlanID, NodeKey: node.NodeKey, Order: node.Order,
		Title: node.Title, Type: node.Type, Goal: node.Goal, DependsOn: encodeStrings(node.DependsOn),
		EstimatedRisk: node.EstimatedRisk, ExpectedFiles: encodeStrings(node.ExpectedFiles),
		NonGoals: encodeStrings(node.NonGoals), AcceptanceCriteria: encodeStrings(node.AcceptanceCriteria),
		TestCommands: encodeStrings(node.TestCommands), BranchName: node.BranchName,
		Status: node.Status, CreatedAt: node.CreatedAt, UpdatedAt: node.UpdatedAt,
	}
}

func (po *PRNodePO) toDomain() *domain.SpecForgePRNode {
	return &domain.SpecForgePRNode{
		ID: po.ID, PlanID: po.PlanID, NodeKey: po.NodeKey, Order: po.Order,
		Title: po.Title, Type: po.Type, Goal: po.Goal, DependsOn: decodeStrings(po.DependsOn),
		EstimatedRisk: po.EstimatedRisk, ExpectedFiles: decodeStrings(po.ExpectedFiles),
		NonGoals: decodeStrings(po.NonGoals), AcceptanceCriteria: decodeStrings(po.AcceptanceCriteria),
		TestCommands: decodeStrings(po.TestCommands), BranchName: po.BranchName,
		Status: po.Status, CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
	}
}

func newCompiledPromptPO(prompt *domain.SpecForgeCompiledPrompt) *CompiledPromptPO {
	return &CompiledPromptPO{
		ID:         prompt.ID,
		PRNodeID:   prompt.PRNodeID,
		PlanID:     prompt.PlanID,
		Type:       prompt.Type,
		Version:    prompt.Version,
		PromptText: prompt.PromptText,
		PromptHash: prompt.PromptHash,
		CreatedBy:  prompt.CreatedBy,
		CreatedAt:  prompt.CreatedAt,
	}
}

func (po *CompiledPromptPO) toDomain() *domain.SpecForgeCompiledPrompt {
	return &domain.SpecForgeCompiledPrompt{
		ID:         po.ID,
		PRNodeID:   po.PRNodeID,
		PlanID:     po.PlanID,
		Type:       po.Type,
		Version:    po.Version,
		PromptText: po.PromptText,
		PromptHash: po.PromptHash,
		CreatedBy:  po.CreatedBy,
		CreatedAt:  po.CreatedAt,
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
