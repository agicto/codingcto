package agent

import "testing"

func TestExpertRunRefRoundTrip(t *testing.T) {
	ref := FormatExpertRunRef(42)
	if ref != "expert_run:42" {
		t.Fatalf("unexpected ref: %s", ref)
	}
	parsed, ok := ParseExpertRunRef(ref)
	if !ok {
		t.Fatalf("expected ref to parse")
	}
	if parsed.ID != 42 {
		t.Fatalf("unexpected parsed id: %d", parsed.ID)
	}
}

func TestSkillVersionRefRoundTrip(t *testing.T) {
	ref := FormatSkillVersionRef(7, 3)
	if ref != "expert_skill:7:v3" {
		t.Fatalf("unexpected ref: %s", ref)
	}
	parsed, ok := ParseSkillVersionRef(ref)
	if !ok {
		t.Fatalf("expected ref to parse")
	}
	if parsed.SkillID != 7 || parsed.Version != 3 {
		t.Fatalf("unexpected parsed ref: %+v", parsed)
	}
}

func TestInvalidRefs(t *testing.T) {
	invalidExpertRefs := []string{"", "expert_run", "expert_run:0", "expert_run:x", "skill_run:1"}
	for _, value := range invalidExpertRefs {
		if _, ok := ParseExpertRunRef(value); ok {
			t.Fatalf("expected invalid expert ref %q", value)
		}
	}

	invalidSkillRefs := []string{"", "expert_skill", "expert_skill:0:v1", "expert_skill:1:v0", "expert_skill:1:1", "expert_skill:x:v1"}
	for _, value := range invalidSkillRefs {
		if _, ok := ParseSkillVersionRef(value); ok {
			t.Fatalf("expected invalid skill ref %q", value)
		}
	}
}
