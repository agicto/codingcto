package seeders

import (
	"errors"

	"github.com/zgiai/luas/api/internal/modules/user"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type UserSeeder struct{}

const legacySecretPasswordHash = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"

func (s *UserSeeder) Name() string {
	return "users"
}

func (s *UserSeeder) Run(db *gorm.DB) error {
	passwordHash, err := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	users := []user.UserPO{
		{
			Username: "admin",
			Email:    "admin@example.com",
			Password: string(passwordHash),
			Nickname: "Administrator",
			Status:   1,
		},
		{
			Username: "user",
			Email:    "user@example.com",
			Password: string(passwordHash),
			Nickname: "Regular User",
			Status:   1,
		},
	}

	for _, u := range users {
		var existing user.UserPO
		err := db.Where("email = ?", u.Email).First(&existing).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if err := db.Create(&u).Error; err != nil {
				return err
			}
			continue
		}
		if err != nil {
			return err
		}

		if existing.Password == "hashed_password_here" || existing.Password == legacySecretPasswordHash {
			if err := db.Model(&existing).Update("password", u.Password).Error; err != nil {
				return err
			}
		}

		if existing.Status == 0 {
			if err := db.Model(&existing).Update("status", u.Status).Error; err != nil {
				return err
			}
		}
		if existing.Username == "" {
			if err := db.Model(&existing).Update("username", u.Username).Error; err != nil {
				return err
			}
		}
		if existing.Nickname == "" {
			if err := db.Model(&existing).Update("nickname", u.Nickname).Error; err != nil {
				return err
			}
		}
	}

	return nil
}

func init() {
	register(&UserSeeder{})
}
