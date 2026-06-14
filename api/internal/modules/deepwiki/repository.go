package deepwiki

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

func (r *repository) CreateSource(ctx context.Context, source *domain.DeepWikiSource) error {
	po := newSourcePO(source)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	*source = *po.toDomain()
	return nil
}

func (r *repository) UpdateSource(ctx context.Context, source *domain.DeepWikiSource) error {
	po := newSourcePO(source)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	*source = *po.toDomain()
	return nil
}

func (r *repository) DeleteSource(ctx context.Context, sourceID uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var indexIDs []uint
		if err := tx.Model(&IndexPO{}).Where("source_id = ?", sourceID).Pluck("id", &indexIDs).Error; err != nil {
			return err
		}
		if len(indexIDs) > 0 {
			if err := tx.Where("index_id IN ?", indexIDs).Delete(&PagePO{}).Error; err != nil {
				return err
			}
			if err := tx.Where("index_id IN ?", indexIDs).Delete(&ChunkPO{}).Error; err != nil {
				return err
			}
			if err := tx.Where("id IN ?", indexIDs).Delete(&IndexPO{}).Error; err != nil {
				return err
			}
		}
		result := tx.Delete(&SourcePO{}, sourceID)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return domain.ErrNotFound
		}
		return nil
	})
}

func (r *repository) FindSourceByID(ctx context.Context, id uint) (*domain.DeepWikiSource, error) {
	var po SourcePO
	if err := r.db.WithContext(ctx).First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListSources(ctx context.Context, filter domain.DeepWikiSourceFilter, page, pageSize int) ([]*domain.DeepWikiSource, int64, error) {
	var rows []*SourcePO
	var total int64
	query := r.db.WithContext(ctx).Model(&SourcePO{})
	if filter.CreatedBy > 0 {
		query = query.Where("created_by = ?", filter.CreatedBy)
	}
	if strings.TrimSpace(filter.WorkspaceID) != "" {
		query = query.Where("workspace_id = ?", strings.TrimSpace(filter.WorkspaceID))
	}
	if filter.ProjectID > 0 {
		query = query.Where("project_id = ?", filter.ProjectID)
	}
	if strings.TrimSpace(filter.RepositoryID) != "" {
		query = query.Where("repository_id = ?", strings.TrimSpace(filter.RepositoryID))
	}
	if strings.TrimSpace(filter.SourceType) != "" {
		query = query.Where("source_type = ?", strings.TrimSpace(filter.SourceType))
	}
	if strings.TrimSpace(filter.Status) != "" {
		query = query.Where("status = ?", strings.TrimSpace(filter.Status))
	}
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 15
	}
	if err := query.Order("updated_at DESC, id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	sources := make([]*domain.DeepWikiSource, len(rows))
	for i, row := range rows {
		sources[i] = row.toDomain()
	}
	return sources, total, nil
}

func (r *repository) CreateIndex(ctx context.Context, index *domain.DeepWikiIndex) error {
	po := newIndexPO(index)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	*index = *po.toDomain()
	return nil
}

func (r *repository) UpdateIndex(ctx context.Context, index *domain.DeepWikiIndex) error {
	po := newIndexPO(index)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	*index = *po.toDomain()
	return nil
}

func (r *repository) FindIndexByID(ctx context.Context, id uint) (*domain.DeepWikiIndex, error) {
	var po IndexPO
	if err := r.db.WithContext(ctx).First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) FindLatestIndexBySourceID(ctx context.Context, sourceID uint) (*domain.DeepWikiIndex, error) {
	var po IndexPO
	if err := r.db.WithContext(ctx).
		Where("source_id = ?", sourceID).
		Order("created_at DESC, id DESC").
		First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) CreateChunks(ctx context.Context, chunks []*domain.DeepWikiChunk) error {
	if len(chunks) == 0 {
		return nil
	}
	rows := make([]*ChunkPO, len(chunks))
	for i, chunk := range chunks {
		rows[i] = newChunkPO(chunk)
	}
	if err := r.db.WithContext(ctx).CreateInBatches(rows, 100).Error; err != nil {
		return err
	}
	for i, row := range rows {
		*chunks[i] = *row.toDomain()
	}
	return nil
}

func (r *repository) ListChunksByIndexID(ctx context.Context, indexID uint) ([]*domain.DeepWikiChunk, error) {
	var rows []*ChunkPO
	if err := r.db.WithContext(ctx).
		Where("index_id = ?", indexID).
		Order("file_path ASC, start_line ASC, id ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	chunks := make([]*domain.DeepWikiChunk, len(rows))
	for i, row := range rows {
		chunks[i] = row.toDomain()
	}
	return chunks, nil
}

func (r *repository) SearchChunks(ctx context.Context, indexID uint, query string, limit int) ([]*domain.DeepWikiChunk, error) {
	var rows []*ChunkPO
	like := "%" + strings.ToLower(strings.TrimSpace(query)) + "%"
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if err := r.db.WithContext(ctx).
		Where("index_id = ? AND (LOWER(keyword_text) LIKE ? OR LOWER(content) LIKE ? OR LOWER(file_path) LIKE ?)", indexID, like, like, like).
		Order("file_path ASC, start_line ASC, id ASC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	chunks := make([]*domain.DeepWikiChunk, len(rows))
	for i, row := range rows {
		chunks[i] = row.toDomain()
	}
	return chunks, nil
}

func (r *repository) CreatePages(ctx context.Context, pages []*domain.DeepWikiPage) error {
	if len(pages) == 0 {
		return nil
	}
	rows := make([]*PagePO, len(pages))
	for i, page := range pages {
		rows[i] = newPagePO(page)
	}
	if err := r.db.WithContext(ctx).CreateInBatches(rows, 20).Error; err != nil {
		return err
	}
	for i, row := range rows {
		*pages[i] = *row.toDomain()
	}
	return nil
}

func (r *repository) ListPagesByIndexID(ctx context.Context, indexID uint) ([]*domain.DeepWikiPage, error) {
	var rows []*PagePO
	if err := r.db.WithContext(ctx).
		Where("index_id = ?", indexID).
		Order("order_index ASC, id ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	pages := make([]*domain.DeepWikiPage, len(rows))
	for i, row := range rows {
		pages[i] = row.toDomain()
	}
	return pages, nil
}

func (r *repository) FindPageByID(ctx context.Context, id uint) (*domain.DeepWikiPage, error) {
	var po PagePO
	if err := r.db.WithContext(ctx).First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) FindPageByIndexAndSlug(ctx context.Context, indexID uint, slug string) (*domain.DeepWikiPage, error) {
	var po PagePO
	if err := r.db.WithContext(ctx).
		Where("index_id = ? AND slug = ?", indexID, strings.TrimSpace(slug)).
		First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) SearchPages(ctx context.Context, indexID uint, query string, limit int) ([]*domain.DeepWikiPage, error) {
	var rows []*PagePO
	like := "%" + strings.ToLower(strings.TrimSpace(query)) + "%"
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if err := r.db.WithContext(ctx).
		Where("index_id = ? AND (LOWER(title) LIKE ? OR LOWER(markdown) LIKE ? OR LOWER(slug) LIKE ?)", indexID, like, like, like).
		Order("order_index ASC, id ASC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	pages := make([]*domain.DeepWikiPage, len(rows))
	for i, row := range rows {
		pages[i] = row.toDomain()
	}
	return pages, nil
}
