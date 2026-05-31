package planning

import (
	"context"
	"errors"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/gorm"
)

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *repository {
	return &repository{db: db}
}

func (r *repository) CreatePlanBundle(ctx context.Context, bundle *domain.SpecForgePlanBundle) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if bundle.Requirement != nil && bundle.Requirement.ID == 0 {
			requirementPO := newRequirementPO(bundle.Requirement)
			if err := tx.Create(requirementPO).Error; err != nil {
				return err
			}
			bundle.Requirement.ID = requirementPO.ID
			bundle.Requirement.CreatedAt = requirementPO.CreatedAt
			bundle.Requirement.UpdatedAt = requirementPO.UpdatedAt
		}
		if bundle.Requirement != nil && bundle.Requirement.ID != 0 {
			bundle.Idea.RequirementID = &bundle.Requirement.ID
			bundle.Idea.ProjectID = &bundle.Requirement.ProjectID
			bundle.Plan.RequirementID = &bundle.Requirement.ID
		}
		ideaPO := newIdeaPO(bundle.Idea)
		if err := tx.Create(ideaPO).Error; err != nil {
			return err
		}
		bundle.Idea.ID = ideaPO.ID
		bundle.Idea.CreatedAt = ideaPO.CreatedAt
		bundle.Idea.UpdatedAt = ideaPO.UpdatedAt

		bundle.ProductSpec.IdeaID = bundle.Idea.ID
		specPO := newProductSpecPO(bundle.ProductSpec)
		if err := tx.Create(specPO).Error; err != nil {
			return err
		}
		bundle.ProductSpec.ID = specPO.ID
		bundle.ProductSpec.CreatedAt = specPO.CreatedAt
		bundle.ProductSpec.UpdatedAt = specPO.UpdatedAt

		bundle.Plan.IdeaID = bundle.Idea.ID
		bundle.Plan.ProductSpecID = bundle.ProductSpec.ID
		planPO := newImplementationPlanPO(bundle.Plan)
		if err := tx.Create(planPO).Error; err != nil {
			return err
		}
		bundle.Plan.ID = planPO.ID
		bundle.Plan.CreatedAt = planPO.CreatedAt
		bundle.Plan.UpdatedAt = planPO.UpdatedAt

		for _, node := range bundle.PRNodes {
			node.PlanID = bundle.Plan.ID
			nodePO := newPRNodePO(node)
			if err := tx.Create(nodePO).Error; err != nil {
				return err
			}
			node.ID = nodePO.ID
			node.CreatedAt = nodePO.CreatedAt
			node.UpdatedAt = nodePO.UpdatedAt
		}
		return nil
	})
}

func (r *repository) CreateRequirement(ctx context.Context, requirement *domain.SpecForgeRequirement) error {
	if requirement == nil || strings.TrimSpace(requirement.RawInput) == "" || requirement.ProjectID == 0 {
		return domain.ErrInvalidInput
	}
	po := newRequirementPO(requirement)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	requirement.ID = po.ID
	requirement.CreatedAt = po.CreatedAt
	requirement.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) FindRequirementByID(ctx context.Context, requirementID uint) (*domain.SpecForgeRequirement, error) {
	if requirementID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var po RequirementPO
	if err := r.db.WithContext(ctx).First(&po, requirementID).Error; err != nil {
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) UpdateRequirement(ctx context.Context, requirement *domain.SpecForgeRequirement) error {
	if requirement == nil || requirement.ID == 0 {
		return domain.ErrInvalidInput
	}
	po := newRequirementPO(requirement)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	requirement.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) FindPlanBundleByIdeaID(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error) {
	var idea IdeaPO
	if err := r.db.WithContext(ctx).First(&idea, ideaID).Error; err != nil {
		return nil, err
	}
	return r.findBundle(ctx, "idea_id = ?", idea.ID)
}

func (r *repository) FindLatestPlanBundleByRequirementID(ctx context.Context, requirementID uint) (*domain.SpecForgePlanBundle, error) {
	if requirementID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var plan ImplementationPlanPO
	if err := r.db.WithContext(ctx).Where("requirement_id = ?", requirementID).Order("version DESC, id DESC").First(&plan).Error; err != nil {
		return nil, err
	}
	return r.findBundle(ctx, "id = ?", plan.ID)
}

func (r *repository) FindLatestPlanBundleByProjectID(ctx context.Context, projectID uint) (*domain.SpecForgePlanBundle, error) {
	if projectID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var plan ImplementationPlanPO
	if err := r.db.WithContext(ctx).
		Joins("JOIN specforge_ideas ON specforge_ideas.id = specforge_implementation_plans.idea_id").
		Where("specforge_ideas.project_id = ?", projectID).
		Order("specforge_implementation_plans.created_at DESC, specforge_implementation_plans.id DESC").
		First(&plan).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return r.findBundle(ctx, "id = ?", plan.ID)
}

func (r *repository) FindPlanBundleByPlanID(ctx context.Context, planID uint) (*domain.SpecForgePlanBundle, error) {
	var plan ImplementationPlanPO
	if err := r.db.WithContext(ctx).First(&plan, planID).Error; err != nil {
		return nil, err
	}
	return r.findBundle(ctx, "id = ?", plan.ID)
}

func (r *repository) NextPlanVersionByRequirementID(ctx context.Context, requirementID uint) (int, error) {
	if requirementID == 0 {
		return 0, domain.ErrInvalidInput
	}
	var latest ImplementationPlanPO
	err := r.db.WithContext(ctx).Where("requirement_id = ?", requirementID).Order("version DESC, id DESC").First(&latest).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 1, nil
		}
		return 0, err
	}
	if latest.Version <= 0 {
		return 1, nil
	}
	return latest.Version + 1, nil
}

func (r *repository) UpdatePlan(ctx context.Context, plan *domain.SpecForgeImplementationPlan) error {
	po := newImplementationPlanPO(plan)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	plan.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) FindPRNodeByID(ctx context.Context, prNodeID uint) (*domain.SpecForgePRNode, error) {
	var po PRNodePO
	if err := r.db.WithContext(ctx).First(&po, prNodeID).Error; err != nil {
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) FindPRNodeByBranchName(ctx context.Context, branchName string) (*domain.SpecForgePRNode, error) {
	branchName = strings.TrimSpace(branchName)
	if branchName == "" {
		return nil, domain.ErrInvalidInput
	}
	var po PRNodePO
	if err := r.db.WithContext(ctx).Where("branch_name = ?", branchName).First(&po).Error; err != nil {
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) FindPRNodeByGitHubPRNumber(ctx context.Context, prNumber int) (*domain.SpecForgePRNode, error) {
	if prNumber <= 0 {
		return nil, domain.ErrInvalidInput
	}
	var po PRNodePO
	if err := r.db.WithContext(ctx).Where("github_pr_number = ?", prNumber).First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) UpdatePRNode(ctx context.Context, node *domain.SpecForgePRNode) error {
	if node == nil || node.ID == 0 {
		return domain.ErrInvalidInput
	}
	po := newPRNodePO(node)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	node.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) CreateCompiledPrompt(ctx context.Context, prompt *domain.SpecForgeCompiledPrompt) error {
	po := newCompiledPromptPO(prompt)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	prompt.ID = po.ID
	prompt.CreatedAt = po.CreatedAt
	return nil
}

func (r *repository) FindLatestCompiledPromptByPRNodeID(ctx context.Context, prNodeID uint) (*domain.SpecForgeCompiledPrompt, error) {
	if prNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var po CompiledPromptPO
	if err := r.db.WithContext(ctx).Where("pr_node_id = ?", prNodeID).Order("id DESC").First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) FindLatestCompiledPromptByPRNodeIDAndType(ctx context.Context, prNodeID uint, promptType string) (*domain.SpecForgeCompiledPrompt, error) {
	promptType = strings.TrimSpace(promptType)
	if prNodeID == 0 || promptType == "" {
		return nil, domain.ErrInvalidInput
	}
	var po CompiledPromptPO
	if err := r.db.WithContext(ctx).Where("pr_node_id = ? AND type = ?", prNodeID, promptType).Order("id DESC").First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) UpsertSkill(ctx context.Context, skill *domain.SpecForgeSkill) error {
	if skill == nil || strings.TrimSpace(skill.RepositoryID) == "" || strings.TrimSpace(skill.Name) == "" {
		return domain.ErrInvalidInput
	}
	var existing SkillPO
	query := r.db.WithContext(ctx).Where("repository_id = ? AND name = ?", skill.RepositoryID, skill.Name).First(&existing)
	if query.Error != nil && !errors.Is(query.Error, gorm.ErrRecordNotFound) {
		return query.Error
	}
	po := newSkillPO(skill)
	if query.Error == nil {
		po.ID = existing.ID
		po.CreatedAt = existing.CreatedAt
	}
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	skill.ID = po.ID
	skill.CreatedAt = po.CreatedAt
	skill.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) ListActiveSkillsByRepositoryID(ctx context.Context, repositoryID string) ([]*domain.SpecForgeSkill, error) {
	repositoryID = strings.TrimSpace(repositoryID)
	if repositoryID == "" {
		return nil, domain.ErrInvalidInput
	}
	var pos []*SkillPO
	if err := r.db.WithContext(ctx).Where("repository_id = ? AND active = ?", repositoryID, true).Order("name ASC, id ASC").Find(&pos).Error; err != nil {
		return nil, err
	}
	return skillsToDomain(pos), nil
}

func (r *repository) ListSkillsByRepositoryID(ctx context.Context, repositoryID string) ([]*domain.SpecForgeSkill, error) {
	repositoryID = strings.TrimSpace(repositoryID)
	if repositoryID == "" {
		return nil, domain.ErrInvalidInput
	}
	var pos []*SkillPO
	if err := r.db.WithContext(ctx).Where("repository_id = ?", repositoryID).Order("name ASC, id ASC").Find(&pos).Error; err != nil {
		return nil, err
	}
	return skillsToDomain(pos), nil
}

func (r *repository) UpsertProjectSkill(ctx context.Context, projectSkill *domain.SpecForgeProjectSkill) error {
	if projectSkill == nil || projectSkill.ProjectID == 0 || projectSkill.SkillID == 0 || strings.TrimSpace(projectSkill.WorkspaceID) == "" || strings.TrimSpace(projectSkill.RepositoryID) == "" {
		return domain.ErrInvalidInput
	}
	var existing ProjectSkillPO
	query := r.db.WithContext(ctx).Where("project_id = ? AND skill_id = ?", projectSkill.ProjectID, projectSkill.SkillID).First(&existing)
	if query.Error != nil && !errors.Is(query.Error, gorm.ErrRecordNotFound) {
		return query.Error
	}
	po := newProjectSkillPO(projectSkill)
	if query.Error == nil {
		po.ID = existing.ID
		po.CreatedAt = existing.CreatedAt
	}
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	loaded, err := r.findProjectSkillByID(ctx, po.ID)
	if err != nil {
		return err
	}
	*projectSkill = *loaded
	return nil
}

func (r *repository) ListProjectSkillsByProjectID(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectSkill, error) {
	if projectID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var pos []*ProjectSkillPO
	if err := r.db.WithContext(ctx).Preload("Skill").Where("project_id = ?", projectID).Order("sort_order ASC, id ASC").Find(&pos).Error; err != nil {
		return nil, err
	}
	return projectSkillsToDomain(pos), nil
}

func (r *repository) ListActiveProjectSkillsByProjectID(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectSkill, error) {
	if projectID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var pos []*ProjectSkillPO
	if err := r.db.WithContext(ctx).Preload("Skill").Where("project_id = ? AND active = ?", projectID, true).Order("sort_order ASC, id ASC").Find(&pos).Error; err != nil {
		return nil, err
	}
	return projectSkillsToDomain(pos), nil
}

func (r *repository) CreateSkillRun(ctx context.Context, run *domain.SpecForgeSkillRun) error {
	if run == nil || strings.TrimSpace(run.Stage) == "" || strings.TrimSpace(run.Status) == "" {
		return domain.ErrInvalidInput
	}
	po := newSkillRunPO(run)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	run.ID = po.ID
	run.CreatedAt = po.CreatedAt
	run.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) ListSkillRunsByRequirementID(ctx context.Context, requirementID uint) ([]*domain.SpecForgeSkillRun, error) {
	if requirementID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var pos []*SkillRunPO
	if err := r.db.WithContext(ctx).Where("requirement_id = ?", requirementID).Order("id ASC").Find(&pos).Error; err != nil {
		return nil, err
	}
	return skillRunsToDomain(pos), nil
}

func (r *repository) ListSkillRunsByPlanID(ctx context.Context, planID uint) ([]*domain.SpecForgeSkillRun, error) {
	if planID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var pos []*SkillRunPO
	if err := r.db.WithContext(ctx).Where("plan_id = ?", planID).Order("id ASC").Find(&pos).Error; err != nil {
		return nil, err
	}
	return skillRunsToDomain(pos), nil
}

func (r *repository) findProjectSkillByID(ctx context.Context, id uint) (*domain.SpecForgeProjectSkill, error) {
	var po ProjectSkillPO
	if err := r.db.WithContext(ctx).Preload("Skill").First(&po, id).Error; err != nil {
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) findBundle(ctx context.Context, query string, args ...any) (*domain.SpecForgePlanBundle, error) {
	var plan ImplementationPlanPO
	if err := r.db.WithContext(ctx).Where(query, args...).First(&plan).Error; err != nil {
		return nil, err
	}

	var idea IdeaPO
	if err := r.db.WithContext(ctx).First(&idea, plan.IdeaID).Error; err != nil {
		return nil, err
	}

	var requirement *domain.SpecForgeRequirement
	if idea.RequirementID != nil && *idea.RequirementID != 0 {
		var requirementPO RequirementPO
		if err := r.db.WithContext(ctx).First(&requirementPO, *idea.RequirementID).Error; err != nil {
			return nil, err
		}
		requirement = requirementPO.toDomain()
	}

	var spec ProductSpecPO
	if err := r.db.WithContext(ctx).First(&spec, plan.ProductSpecID).Error; err != nil {
		return nil, err
	}

	var nodePOs []*PRNodePO
	if err := r.db.WithContext(ctx).Where("plan_id = ?", plan.ID).Order("\"order\" ASC, id ASC").Find(&nodePOs).Error; err != nil {
		return nil, err
	}

	nodes := make([]*domain.SpecForgePRNode, len(nodePOs))
	for i, po := range nodePOs {
		nodes[i] = po.toDomain()
	}

	return &domain.SpecForgePlanBundle{
		Requirement: requirement,
		Idea:        idea.toDomain(),
		ProductSpec: spec.toDomain(),
		Plan:        plan.toDomain(),
		PRNodes:     nodes,
	}, nil
}

func skillsToDomain(pos []*SkillPO) []*domain.SpecForgeSkill {
	out := make([]*domain.SpecForgeSkill, len(pos))
	for i, po := range pos {
		out[i] = po.toDomain()
	}
	return out
}

func projectSkillsToDomain(pos []*ProjectSkillPO) []*domain.SpecForgeProjectSkill {
	out := make([]*domain.SpecForgeProjectSkill, len(pos))
	for i, po := range pos {
		out[i] = po.toDomain()
	}
	return out
}

func skillRunsToDomain(pos []*SkillRunPO) []*domain.SpecForgeSkillRun {
	out := make([]*domain.SpecForgeSkillRun, len(pos))
	for i, po := range pos {
		out[i] = po.toDomain()
	}
	return out
}
