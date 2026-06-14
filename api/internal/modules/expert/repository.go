package expert

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

func (r *repository) UpsertExpert(ctx context.Context, expert *domain.CodingCTOExpert) error {
	if expert == nil || strings.TrimSpace(expert.Key) == "" || strings.TrimSpace(expert.Name) == "" {
		return domain.ErrInvalidInput
	}
	var existing ExpertPO
	query := r.db.WithContext(ctx).Where("key = ?", expert.Key).First(&existing)
	if query.Error != nil && !errors.Is(query.Error, gorm.ErrRecordNotFound) {
		return query.Error
	}
	po := newExpertPO(expert)
	if query.Error == nil {
		po.ID = existing.ID
		po.CreatedAt = existing.CreatedAt
	}
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	*expert = *po.toDomain()
	return nil
}

func (r *repository) FindExpertByID(ctx context.Context, id uint) (*domain.CodingCTOExpert, error) {
	if id == 0 {
		return nil, domain.ErrInvalidInput
	}
	var po ExpertPO
	if err := r.db.WithContext(ctx).First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListExperts(ctx context.Context, activeOnly bool) ([]*domain.CodingCTOExpert, error) {
	var pos []*ExpertPO
	query := r.db.WithContext(ctx).Order("sort_order ASC, id ASC")
	if activeOnly {
		query = query.Where("active = ?", true)
	}
	if err := query.Find(&pos).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.CodingCTOExpert, len(pos))
	for i, po := range pos {
		out[i] = po.toDomain()
	}
	return out, nil
}

func (r *repository) UpsertSkillWithVersion(ctx context.Context, skill *domain.CodingCTOExpertSkill, version *domain.CodingCTOExpertSkillVersion, promote bool) error {
	if skill == nil || version == nil || skill.ExpertID == 0 || strings.TrimSpace(skill.Name) == "" || strings.TrimSpace(version.Content) == "" {
		return domain.ErrInvalidInput
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existing ExpertSkillPO
		query := tx.Where("expert_id = ? AND name = ? AND COALESCE(repository_id, '') = ?", skill.ExpertID, skill.Name, strings.TrimSpace(skill.RepositoryID)).First(&existing)
		if query.Error != nil && !errors.Is(query.Error, gorm.ErrRecordNotFound) {
			return query.Error
		}
		skillPO := newExpertSkillPO(skill)
		if query.Error == nil {
			skillPO.ID = existing.ID
			skillPO.CreatedAt = existing.CreatedAt
			if skill.CurrentVersionID == nil {
				skillPO.CurrentVersionID = existing.CurrentVersionID
			}
		}
		if err := tx.Save(skillPO).Error; err != nil {
			return err
		}
		skill.ID = skillPO.ID
		skill.CreatedAt = skillPO.CreatedAt
		skill.UpdatedAt = skillPO.UpdatedAt

		nextVersion, err := r.nextSkillVersion(ctx, tx, skill.ID)
		if err != nil {
			return err
		}
		version.SkillID = skill.ID
		version.Version = nextVersion
		versionPO := newExpertSkillVersionPO(version)
		if err := tx.Create(versionPO).Error; err != nil {
			return err
		}
		*version = *versionPO.toDomain()
		if promote {
			if err := tx.Model(&ExpertSkillPO{}).Where("id = ?", skill.ID).Update("current_version_id", version.ID).Error; err != nil {
				return err
			}
			skill.CurrentVersionID = &version.ID
		}
		return nil
	})
}

func (r *repository) CreateSkillVersion(ctx context.Context, version *domain.CodingCTOExpertSkillVersion, promote bool) error {
	if version == nil || version.SkillID == 0 || strings.TrimSpace(version.Content) == "" {
		return domain.ErrInvalidInput
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		nextVersion, err := r.nextSkillVersion(ctx, tx, version.SkillID)
		if err != nil {
			return err
		}
		version.Version = nextVersion
		po := newExpertSkillVersionPO(version)
		if err := tx.Create(po).Error; err != nil {
			return err
		}
		*version = *po.toDomain()
		if promote {
			return tx.Model(&ExpertSkillPO{}).Where("id = ?", version.SkillID).Update("current_version_id", version.ID).Error
		}
		return nil
	})
}

func (r *repository) FindSkillByID(ctx context.Context, id uint) (*domain.CodingCTOExpertSkill, error) {
	if id == 0 {
		return nil, domain.ErrInvalidInput
	}
	var po ExpertSkillPO
	if err := r.db.WithContext(ctx).Preload("CurrentVersion").First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListSkillsByExpertID(ctx context.Context, expertID uint) ([]*domain.CodingCTOExpertSkill, error) {
	if expertID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var pos []*ExpertSkillPO
	if err := r.db.WithContext(ctx).Preload("CurrentVersion").Where("expert_id = ?", expertID).Order("name ASC, id ASC").Find(&pos).Error; err != nil {
		return nil, err
	}
	return expertSkillsToDomain(pos), nil
}

func (r *repository) ListCurrentSkillsForExperts(ctx context.Context, expertIDs []uint, repositoryID string) ([]*domain.CodingCTOExpertSkill, error) {
	if len(expertIDs) == 0 {
		return []*domain.CodingCTOExpertSkill{}, nil
	}
	var pos []*ExpertSkillPO
	query := r.db.WithContext(ctx).
		Preload("CurrentVersion").
		Where("expert_id IN ? AND active = ?", expertIDs, true).
		Where("(repository_id = ? OR repository_id = '')", strings.TrimSpace(repositoryID)).
		Order("expert_id ASC, name ASC, id ASC")
	if err := query.Find(&pos).Error; err != nil {
		return nil, err
	}
	return expertSkillsToDomain(pos), nil
}

func (r *repository) ListSkillVersions(ctx context.Context, skillID uint) ([]*domain.CodingCTOExpertSkillVersion, error) {
	if skillID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var pos []*ExpertSkillVersionPO
	if err := r.db.WithContext(ctx).Where("skill_id = ?", skillID).Order("version DESC, id DESC").Find(&pos).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.CodingCTOExpertSkillVersion, len(pos))
	for i, po := range pos {
		out[i] = po.toDomain()
	}
	return out, nil
}

func (r *repository) CreateExpertRun(ctx context.Context, run *domain.CodingCTOExpertRun) error {
	if run == nil || run.ExpertID == 0 {
		return domain.ErrInvalidInput
	}
	po := newExpertRunPO(run)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	*run = *po.toDomain()
	return nil
}

func (r *repository) ListExpertRuns(ctx context.Context, expertID uint) ([]*domain.CodingCTOExpertRun, error) {
	if expertID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var pos []*ExpertRunPO
	if err := r.db.WithContext(ctx).Where("expert_id = ?", expertID).Order("id DESC").Limit(100).Find(&pos).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.CodingCTOExpertRun, len(pos))
	for i, po := range pos {
		out[i] = po.toDomain()
	}
	return out, nil
}

func (r *repository) CreateEvolutionProposal(ctx context.Context, proposal *domain.CodingCTOSkillEvolutionProposal) error {
	if proposal == nil || proposal.SkillID == 0 || proposal.ExpertID == 0 || proposal.BaseVersionID == 0 {
		return domain.ErrInvalidInput
	}
	po := newSkillEvolutionProposalPO(proposal)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	*proposal = *po.toDomain()
	return nil
}

func (r *repository) FindEvolutionProposalByID(ctx context.Context, id uint) (*domain.CodingCTOSkillEvolutionProposal, error) {
	if id == 0 {
		return nil, domain.ErrInvalidInput
	}
	var po SkillEvolutionProposalPO
	if err := r.db.WithContext(ctx).First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListEvolutionProposalsBySkillID(ctx context.Context, skillID uint) ([]*domain.CodingCTOSkillEvolutionProposal, error) {
	if skillID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var pos []*SkillEvolutionProposalPO
	if err := r.db.WithContext(ctx).Where("skill_id = ?", skillID).Order("id DESC").Find(&pos).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.CodingCTOSkillEvolutionProposal, len(pos))
	for i, po := range pos {
		out[i] = po.toDomain()
	}
	return out, nil
}

func (r *repository) UpdateEvolutionProposal(ctx context.Context, proposal *domain.CodingCTOSkillEvolutionProposal) error {
	if proposal == nil || proposal.ID == 0 {
		return domain.ErrInvalidInput
	}
	po := newSkillEvolutionProposalPO(proposal)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	*proposal = *po.toDomain()
	return nil
}

func (r *repository) PromoteProposal(ctx context.Context, proposal *domain.CodingCTOSkillEvolutionProposal, userID uint) (*domain.CodingCTOExpertSkillVersion, error) {
	if proposal == nil || proposal.ID == 0 || proposal.SkillID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var version *domain.CodingCTOExpertSkillVersion
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		nowProposal := newSkillEvolutionProposalPO(proposal)
		nowProposal.Status = domain.ExpertSkillProposalStatusPromoted
		if err := tx.Save(nowProposal).Error; err != nil {
			return err
		}
		nextVersion, err := r.nextSkillVersion(ctx, tx, proposal.SkillID)
		if err != nil {
			return err
		}
		created := &domain.CodingCTOExpertSkillVersion{
			SkillID: proposal.SkillID, Version: nextVersion, Content: proposal.ProposedContent,
			ContentHash: proposal.ProposedContentHash, ChangeSummary: proposal.Rationale,
			Source: "expert_proposal", CreatedBy: userID, PromotedBy: &userID,
		}
		versionPO := newExpertSkillVersionPO(created)
		if err := tx.Create(versionPO).Error; err != nil {
			return err
		}
		if err := tx.Model(&ExpertSkillPO{}).Where("id = ?", proposal.SkillID).Update("current_version_id", versionPO.ID).Error; err != nil {
			return err
		}
		version = versionPO.toDomain()
		*proposal = *nowProposal.toDomain()
		return nil
	})
	return version, err
}

func (r *repository) nextSkillVersion(ctx context.Context, tx *gorm.DB, skillID uint) (int, error) {
	var latest ExpertSkillVersionPO
	err := tx.WithContext(ctx).Where("skill_id = ?", skillID).Order("version DESC, id DESC").First(&latest).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return 1, nil
		}
		return 0, err
	}
	return latest.Version + 1, nil
}

func expertSkillsToDomain(pos []*ExpertSkillPO) []*domain.CodingCTOExpertSkill {
	out := make([]*domain.CodingCTOExpertSkill, len(pos))
	for i, po := range pos {
		out[i] = po.toDomain()
	}
	return out
}
