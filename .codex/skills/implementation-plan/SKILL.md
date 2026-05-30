---
name: implementation-plan
description: Create detailed engineering implementation plans from PRDs, product ideas, architecture notes, prototypes, or codebase reviews. Use when the user asks to design a development plan, implementation plan, PRD-to-engineering handoff, architecture execution plan, task breakdown, or a detailed roadmap with database design, domain models, APIs, states, permissions, risks, tests, and PR slicing.
---

# Implementation Plan

Use this skill to turn a product or architecture direction into a buildable engineering plan. The output should be concrete enough that a coding agent or engineer can start implementing small PRs without re-discovering the business model.

## Operating Principle

Do not write a loose roadmap. Write an execution plan that connects:

```text
user action
  -> business object change
  -> state transition
  -> database write
  -> module call
  -> API response
  -> frontend state
  -> test/validation
```

Every major claim should be grounded in the PRD, existing codebase, repository instructions, or an explicit assumption.

## Inputs To Collect

Use available local context before asking questions.

Minimum inputs:

- Product goal or PRD.
- Current codebase architecture and repo instructions.
- Target users or roles.
- MVP boundary.
- Existing backend/frontend stack.

Helpful inputs:

- Prototype route list or screenshots.
- Existing database schema.
- Existing domain modules.
- Reference implementation plans.
- Known risks or non-goals.

If a detail is missing, make a conservative assumption and mark it as an assumption or open question.

## Workflow

### 1. System Overview

Define:

- What the system is.
- The core business loop.
- The MVP boundary.
- The main success condition.

Use a short flow diagram:

```text
Actor action -> domain flow -> delivery outcome
```

### 2. Roles And Pages

List each role with:

- Pages/routes.
- Main actions.
- Role-specific business rules.
- Permission differences.

Use tables for page lists.

### 3. Business Objects

Define the domain language and relationships.

Include:

- Aggregate roots.
- Child entities.
- Join objects.
- Ownership boundaries.
- Cardinality rules.

Prefer explicit relationship diagrams:

```text
Workspace
  -> Project
      -> Repository
      -> Requirement
          -> Plan
              -> TaskNode
```

### 4. Database Design

Split into:

- Existing tables to reuse or extend.
- New tables.
- Field definitions.
- Indexes and unique constraints.
- Migration order.
- Seed/backfill strategy.

For Go/GORM projects, include PO structs when useful:

```go
type ProjectPO struct {
    ID        uint           `gorm:"primaryKey"`
    CreatedAt time.Time
    UpdatedAt time.Time
    DeletedAt gorm.DeletedAt `gorm:"index"`
    Name      string         `gorm:"size:120;not null"`
}

func (ProjectPO) TableName() string { return "projects" }
```

### 5. Domain Layer

Define domain entities separately from database persistence.

Include:

- Entity fields.
- Domain methods.
- Invariants.
- Illegal transitions.
- Retry/cancel/block rules.

### 6. State Machines

For every long-running or approval-based object, define:

- Normal states.
- Exception states.
- Legal transitions.
- Blocking conditions.
- Retry rules.

Use text diagrams:

```text
draft -> awaiting_approval -> approved -> executing -> completed
                         \-> cancelled
executing -> blocked -> retrying -> executing
```

### 7. Core Business Rules

Make guardrails explicit:

- Limits.
- Default decisions.
- What is allowed.
- What is forbidden.
- What requires approval.
- What triggers escalation.

### 8. API Draft

For each major flow, define endpoints with:

- Method and path.
- Request body.
- Response shape.
- Required validations.
- Side effects.

Keep API names resource-oriented unless the domain action is a command, such as approve, retry, cancel, or reindex.

### 9. Backend Modules

Define module boundaries:

- Module name.
- Responsibilities.
- Files/directories.
- Public service interface.
- Dependencies.
- Events published/subscribed.

State dependency rules, especially what modules must not import.

### 10. Frontend Pages

Define:

- Routes.
- Feature folders.
- Main components.
- UI states.
- Empty/error/loading states.
- Data types consumed from API.

Do not over-specify visual styling unless the task is a UI design plan.

### 11. Cross-Module Data Flows

Write the critical flows end to end:

- Create flow.
- Approval flow.
- Execution flow.
- Failure/retry flow.
- Webhook/event flow.

Use step lists:

```text
POST /requirements
  -> RequirementService.Create
  -> RepoContextService.EnsureFreshContext
  -> PlannerService.GeneratePlan
  -> PlanService.CreateDraft
```

### 12. Permissions Matrix

Include a role/action matrix for sensitive operations.

Examples:

- Install integration.
- Bind repository.
- Approve plan.
- Start execution.
- Cancel run.
- View logs.
- Manage skills.

### 13. Risk And Hallucination Controls

For AI-assisted systems, include guardrails:

- Evidence refs for key planning claims.
- Skill output validation.
- PR/task DAG validation.
- Prompt contracts.
- Allowed and forbidden file scopes.
- Pre-PR diff risk review.
- CI failure classification.
- Escalation thresholds.

The goal is to prevent:

- Ungrounded planning.
- Invented commands/files.
- Over-broad PRs.
- Executor changes outside scope.
- Infinite auto-fix loops.

### 14. Testing Strategy

Define tests by layer:

- Domain/service tests.
- Repository tests.
- API tests.
- Frontend type/lint tests.
- Browser smoke tests.
- Integration/E2E flows.

For each implementation phase, include expected commands.

### 15. Implementation Phases

Break work into phases with:

- Goal.
- Backend tasks.
- Frontend tasks.
- Tests.
- Acceptance criteria.

A phase should be independently reviewable.

### 16. PR Breakdown

End with a recommended PR sequence.

Each PR should include:

- Scope.
- Non-goals.
- Main files/modules.
- Tests.
- Acceptance criteria.

Keep PRs small enough for human review. Prefer a foundation PR before UI or executor work.

## Output Shape

Use this structure unless the user asks for a different format:

```markdown
# [Product] 开发实施方案

## 一、系统概述
## 二、角色与页面清单
## 三、业务对象与关系
## 四、数据库设计
## 五、Domain 层实体设计
## 六、状态机设计
## 七、核心业务规则
## 八、API 草案
## 九、后端模块拆分
## 十、前端页面拆分
## 十一、跨模块依赖与数据流
## 十二、权限矩阵
## 十三、风险与减少幻觉控制
## 十四、测试策略
## 十五、实施阶段
## 十六、推荐 PR 拆解
## 十七、当前下一步
```

## Quality Bar

The plan is not done until it answers:

- What should be built first?
- Which data models are required?
- Which states can each object enter?
- Which module owns each behavior?
- Which API changes are required?
- Which frontend routes and states are required?
- Which permissions protect sensitive actions?
- How do failures, retries, and cancellations work?
- How will tests prove the behavior?
- What is the first PR?

## Anti-Patterns

Avoid:

- A feature list without state or data model.
- A database schema without domain rules.
- API endpoints without side effects and validation.
- Phases without acceptance criteria.
- AI execution plans without grounding, prompt contracts, or diff review.
- A giant first PR.
- Pretending open questions are resolved.
