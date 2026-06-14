package agent

import (
	"fmt"
	"strconv"
	"strings"
)

const (
	RefKindExpertRun          = "expert_run"
	RefKindExpertSkillVersion = "expert_skill"
)

// ExpertRunRef is the canonical evidence reference for an expert invocation.
type ExpertRunRef struct {
	ID uint `json:"id"`
}

func (r ExpertRunRef) String() string {
	if r.ID == 0 {
		return ""
	}
	return fmt.Sprintf("%s:%d", RefKindExpertRun, r.ID)
}

func FormatExpertRunRef(id uint) string {
	return ExpertRunRef{ID: id}.String()
}

func ParseExpertRunRef(value string) (ExpertRunRef, bool) {
	parts := strings.Split(strings.TrimSpace(value), ":")
	if len(parts) != 2 || parts[0] != RefKindExpertRun {
		return ExpertRunRef{}, false
	}
	id, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil || id == 0 {
		return ExpertRunRef{}, false
	}
	return ExpertRunRef{ID: uint(id)}, true
}

// SkillVersionRef pins an expert skill to the exact version used by a run.
type SkillVersionRef struct {
	SkillID uint `json:"skill_id"`
	Version int  `json:"version"`
}

func (r SkillVersionRef) String() string {
	if r.SkillID == 0 || r.Version <= 0 {
		return ""
	}
	return fmt.Sprintf("%s:%d:v%d", RefKindExpertSkillVersion, r.SkillID, r.Version)
}

func FormatSkillVersionRef(skillID uint, version int) string {
	return SkillVersionRef{SkillID: skillID, Version: version}.String()
}

func ParseSkillVersionRef(value string) (SkillVersionRef, bool) {
	parts := strings.Split(strings.TrimSpace(value), ":")
	if len(parts) != 3 || parts[0] != RefKindExpertSkillVersion || !strings.HasPrefix(parts[2], "v") {
		return SkillVersionRef{}, false
	}
	skillID, err := strconv.ParseUint(parts[1], 10, 64)
	if err != nil || skillID == 0 {
		return SkillVersionRef{}, false
	}
	version, err := strconv.Atoi(strings.TrimPrefix(parts[2], "v"))
	if err != nil || version <= 0 {
		return SkillVersionRef{}, false
	}
	return SkillVersionRef{SkillID: uint(skillID), Version: version}, true
}
