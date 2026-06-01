package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/user"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_31_000029_fix_default_admin_password", &fixDefaultAdminPassword{})
}

// fixDefaultAdminPassword aligns the local default admin credentials with the web console.
type fixDefaultAdminPassword struct {
	migration.BaseMigration
}

const defaultAdminPasswordHash = "$2a$10$bNxBvhYEPCm4vl88DHXMSu72YtYwAHKdUFZo0Z34/l13/prxHnPnC" // password: admin123

// Up applies the migration.
func (m *fixDefaultAdminPassword) Up(db *gorm.DB) error {
	return db.Model(&user.UserPO{}).
		Where("username = ? AND email = ? AND password = ?", "admin", "admin@example.com", "hashed_password_here").
		Update("password", defaultAdminPasswordHash).Error
}

// Down reverts the migration.
func (m *fixDefaultAdminPassword) Down(db *gorm.DB) error {
	return db.Model(&user.UserPO{}).
		Where("username = ? AND email = ?", "admin", "admin@example.com").
		Update("password", "hashed_password_here").Error
}
