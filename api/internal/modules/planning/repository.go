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

func (r *repository) FindPlanBundleByIdeaID(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error) {
	var idea IdeaPO
	if err := r.db.WithContext(ctx).First(&idea, ideaID).Error; err != nil {
		return nil, err
	}
	return r.findBundle(ctx, "idea_id = ?", idea.ID)
}

func (r *repository) FindPlanBundleByPlanID(ctx context.Context, planID uint) (*domain.SpecForgePlanBundle, error) {
	var plan ImplementationPlanPO
	if err := r.db.WithContext(ctx).First(&plan, planID).Error; err != nil {
		return nil, err
	}
	return r.findBundle(ctx, "idea_id = ?", plan.IdeaID)
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

func (r *repository) findBundle(ctx context.Context, query string, args ...any) (*domain.SpecForgePlanBundle, error) {
	var plan ImplementationPlanPO
	if err := r.db.WithContext(ctx).Where(query, args...).First(&plan).Error; err != nil {
		return nil, err
	}

	var idea IdeaPO
	if err := r.db.WithContext(ctx).First(&idea, plan.IdeaID).Error; err != nil {
		return nil, err
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
