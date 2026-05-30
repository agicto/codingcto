import { describe, expect, it } from "vitest";

import {
  skillTemplateById,
  specForgeSkillTemplates,
} from "@/features/specforge/skill-templates";

describe("specForgeSkillTemplates", () => {
  it("includes an evidence-first planning SOP", () => {
    const template = skillTemplateById("planning-sop");

    expect(template).toBeDefined();
    expect(template?.content).toContain("Read repo evidence before planning");
    expect(template?.content).toContain("Run a reverse trace");
    expect(template?.content).toContain("do not broaden scope");
  });

  it("keeps template ids unique", () => {
    const ids = specForgeSkillTemplates.map((template) => template.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
