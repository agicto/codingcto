package planning

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	agentcontract "github.com/zgiai/luas/api/internal/contracts/agent"
	"github.com/zgiai/luas/api/internal/domain"
)

const (
	deepSeekDefaultBaseURL = "https://api.deepseek.com"
	deepSeekDefaultModel   = "deepseek-v4-pro"
	expertPlanToolName     = "draft_implementation_plan"
)

var (
	ErrExpertProviderNotConfigured = errors.New("expert provider not configured")
	ErrExpertProviderFailed        = errors.New("expert provider failed")
	ErrExpertToolCallMissing       = errors.New("expert tool call missing")
)

type deepSeekChatRequest struct {
	Model       string            `json:"model"`
	Messages    []deepSeekMessage `json:"messages"`
	Tools       []deepSeekTool    `json:"tools"`
	ToolChoice  any               `json:"tool_choice"`
	Thinking    map[string]string `json:"thinking,omitempty"`
	Stream      bool              `json:"stream,omitempty"`
	Temperature float64           `json:"temperature"`
	MaxTokens   int               `json:"max_tokens"`
}

type deepSeekMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type deepSeekTool struct {
	Type     string               `json:"type"`
	Function deepSeekToolFunction `json:"function"`
}

type deepSeekToolFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type deepSeekChatResponse struct {
	Model   string           `json:"model"`
	Choices []deepSeekChoice `json:"choices"`
	Usage   map[string]any   `json:"usage"`
}

type deepSeekChoice struct {
	FinishReason string                  `json:"finish_reason"`
	Message      deepSeekResponseMessage `json:"message"`
}

type deepSeekResponseMessage struct {
	Content   string             `json:"content"`
	ToolCalls []deepSeekToolCall `json:"tool_calls"`
}

type deepSeekToolCall struct {
	ID       string               `json:"id"`
	Type     string               `json:"type"`
	Function deepSeekToolCallFunc `json:"function"`
}

type deepSeekToolCallFunc struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type deepSeekStreamChunk struct {
	Model   string                    `json:"model"`
	Choices []deepSeekStreamChoice    `json:"choices"`
	Usage   map[string]any            `json:"usage"`
	Error   *deepSeekStreamChunkError `json:"error"`
}

type deepSeekStreamChunkError struct {
	Message string `json:"message"`
	Type    string `json:"type"`
	Code    string `json:"code"`
}

type deepSeekStreamChoice struct {
	FinishReason string              `json:"finish_reason"`
	Delta        deepSeekStreamDelta `json:"delta"`
}

type deepSeekStreamDelta struct {
	Content          string                   `json:"content"`
	ReasoningContent string                   `json:"reasoning_content"`
	ToolCalls        []deepSeekStreamToolCall `json:"tool_calls"`
}

type deepSeekStreamToolCall struct {
	Index    int                  `json:"index"`
	ID       string               `json:"id"`
	Type     string               `json:"type"`
	Function deepSeekToolCallFunc `json:"function"`
}

type expertPlanToolAccumulator struct {
	id           string
	name         string
	arguments    strings.Builder
	content      strings.Builder
	finishReason string
	model        string
	usage        map[string]any
}

func (s *service) GenerateExpertImplementationPlan(ctx context.Context, userID uint, req *GenerateExpertImplementationPlanRequest) (*ExpertImplementationPlanResponse, error) {
	if userID == 0 || req == nil || strings.TrimSpace(req.Idea) == "" {
		return nil, domain.ErrInvalidInput
	}
	apiKey := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY"))
	if apiKey == "" {
		return nil, ErrExpertProviderNotConfigured
	}

	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "standard"
	}
	model := expertEnvOrDefault("DEEPSEEK_MODEL", deepSeekDefaultModel)
	baseURL := strings.TrimRight(expertEnvOrDefault("DEEPSEEK_BASE_URL", deepSeekDefaultBaseURL), "/")
	payload, err := buildDeepSeekExpertPlanRequest(req, mode, model)
	if err != nil {
		return nil, err
	}
	requestBody, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal deepseek payload: %w", err)
	}

	callCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(callCtx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(requestBody))
	if err != nil {
		return nil, fmt.Errorf("create deepseek request: %w", err)
	}
	httpReq.Header.Set("authorization", "Bearer "+apiKey)
	httpReq.Header.Set("content-type", "application/json")

	resp, err := (&http.Client{Timeout: 125 * time.Second}).Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("%w: request failed: %v", ErrExpertProviderFailed, err)
	}
	defer resp.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if readErr != nil {
		return nil, fmt.Errorf("%w: read response: %v", ErrExpertProviderFailed, readErr)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%w: status %d: %s", ErrExpertProviderFailed, resp.StatusCode, truncateExpertText(string(body), 1200))
	}

	var completion deepSeekChatResponse
	if err := json.Unmarshal(body, &completion); err != nil {
		return nil, fmt.Errorf("%w: decode response: %v", ErrExpertProviderFailed, err)
	}
	toolCall, finishReason, ok := findExpertPlanToolCall(completion)
	if !ok || strings.TrimSpace(toolCall.Function.Arguments) == "" {
		return nil, fmt.Errorf("%w: %s", ErrExpertToolCallMissing, truncateExpertText(expertCompletionContent(completion), 1200))
	}

	var plan ExpertImplementationPlan
	if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &plan); err != nil {
		return nil, fmt.Errorf("%w: parse tool arguments: %v", ErrExpertProviderFailed, err)
	}
	normalizeExpertPlan(&plan)

	result := &ExpertImplementationPlanResponse{
		Plan:     &plan,
		Markdown: renderExpertPlanMarkdown(&plan),
		Provider: "deepseek",
		Model:    expertEnvOrDefaultString(completion.Model, model),
		ToolCall: ExpertToolCallResponse{
			Name:         expertPlanToolName,
			ID:           toolCall.ID,
			FinishReason: finishReason,
		},
		Usage: completion.Usage,
	}
	if err := s.recordExpertImplementationPlanRuns(ctx, userID, req, result); err != nil {
		return nil, err
	}
	return result, nil
}

func (s *service) GenerateExpertImplementationPlanStream(ctx context.Context, userID uint, req *GenerateExpertImplementationPlanRequest, emit func(ExpertPlanStreamEvent) error) error {
	if userID == 0 || req == nil || strings.TrimSpace(req.Idea) == "" || emit == nil {
		return domain.ErrInvalidInput
	}
	apiKey := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY"))
	if apiKey == "" {
		return ErrExpertProviderNotConfigured
	}

	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "standard"
	}
	model := expertEnvOrDefault("DEEPSEEK_MODEL", deepSeekDefaultModel)
	baseURL := strings.TrimRight(expertEnvOrDefault("DEEPSEEK_BASE_URL", deepSeekDefaultBaseURL), "/")
	payload, err := buildDeepSeekExpertPlanRequest(req, mode, model)
	if err != nil {
		return err
	}
	payload.Stream = true
	requestBody, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal deepseek payload: %w", err)
	}

	if err := emit(ExpertPlanStreamEvent{
		Type:    "thinking",
		Phase:   "context",
		Message: "分析 idea、仓库和已选 expert skill，确定实施方案边界",
		Details: []string{
			"输入会被约束为 reviewable PR 里程碑",
			"未确定信息会进入 open_questions",
		},
	}); err != nil {
		return err
	}
	if err := emit(ExpertPlanStreamEvent{
		Type:     "tool_call",
		Phase:    "prepare",
		Message:  "准备调用 DeepSeek Chat Completions",
		ToolName: expertPlanToolName,
		Details: []string{
			"provider=deepseek",
			"model=" + model,
			"thinking=disabled",
			"tool_choice=" + expertPlanToolName,
		},
	}); err != nil {
		return err
	}

	callCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(callCtx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(requestBody))
	if err != nil {
		return fmt.Errorf("create deepseek request: %w", err)
	}
	httpReq.Header.Set("authorization", "Bearer "+apiKey)
	httpReq.Header.Set("content-type", "application/json")
	httpReq.Header.Set("accept", "text/event-stream")

	if err := emit(ExpertPlanStreamEvent{
		Type:     "tool_call",
		Phase:    "request",
		Message:  "请求已发送，等待模型开始返回",
		ToolName: expertPlanToolName,
	}); err != nil {
		return err
	}

	resp, err := (&http.Client{Timeout: 125 * time.Second}).Do(httpReq)
	if err != nil {
		return fmt.Errorf("%w: request failed: %v", ErrExpertProviderFailed, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
		return fmt.Errorf("%w: status %d: %s", ErrExpertProviderFailed, resp.StatusCode, truncateExpertText(string(body), 1200))
	}

	if err := emit(ExpertPlanStreamEvent{
		Type:     "thinking",
		Phase:    "plan_shape",
		Message:  "模型开始组织方案结构：问题、范围、架构、里程碑、风险和下一步",
		ToolName: expertPlanToolName,
	}); err != nil {
		return err
	}

	accumulator := &expertPlanToolAccumulator{model: model}
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 2<<20)
	lastProgressAt := time.Now()
	toolCallAnnounced := false
	reasoningAnnounced := false
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var chunk deepSeekStreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			return fmt.Errorf("%w: decode stream chunk: %v", ErrExpertProviderFailed, err)
		}
		if chunk.Error != nil {
			return fmt.Errorf("%w: %s", ErrExpertProviderFailed, chunk.Error.Message)
		}
		if chunk.Model != "" {
			accumulator.model = chunk.Model
		}
		if len(chunk.Usage) > 0 {
			accumulator.usage = chunk.Usage
		}
		if !reasoningAnnounced && chunk.hasReasoning() {
			reasoningAnnounced = true
			if err := emit(ExpertPlanStreamEvent{
				Type:     "thinking",
				Phase:    "model_reasoning",
				Message:  "模型正在推理方案取舍；页面显示阶段摘要，不直接暴露原始隐式推理 token",
				ToolName: expertPlanToolName,
			}); err != nil {
				return err
			}
		}
		changed := accumulator.consume(chunk)
		if !toolCallAnnounced && accumulator.name != "" {
			toolCallAnnounced = true
			if err := emit(ExpertPlanStreamEvent{
				Type:       "tool_call",
				Phase:      "arguments",
				Message:    "模型已进入 function call，正在输出结构化参数",
				ToolName:   accumulator.name,
				ToolCallID: accumulator.id,
			}); err != nil {
				return err
			}
		}
		if changed && time.Since(lastProgressAt) > 250*time.Millisecond {
			lastProgressAt = time.Now()
			if err := emit(ExpertPlanStreamEvent{
				Type:           "progress",
				Phase:          "arguments",
				Message:        "正在接收 function call 参数",
				ToolName:       expertPlanToolName,
				ToolCallID:     accumulator.id,
				ArgumentsBytes: accumulator.arguments.Len(),
			}); err != nil {
				return err
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return fmt.Errorf("%w: read stream: %v", ErrExpertProviderFailed, err)
	}
	if err := emit(ExpertPlanStreamEvent{
		Type:           "progress",
		Phase:          "parse",
		Message:        "结构化方案接收完成，正在解析",
		ToolName:       expertPlanToolName,
		ToolCallID:     accumulator.id,
		ArgumentsBytes: accumulator.arguments.Len(),
	}); err != nil {
		return err
	}

	result, err := accumulator.response()
	if err != nil {
		return err
	}
	if err := s.recordExpertImplementationPlanRuns(ctx, userID, req, result); err != nil {
		return err
	}
	return emit(ExpertPlanStreamEvent{
		Type:       "result",
		Phase:      "done",
		Message:    "实施方案生成完成",
		ToolName:   expertPlanToolName,
		ToolCallID: accumulator.id,
		Response:   result,
	})
}

func (s *service) recordExpertImplementationPlanRuns(ctx context.Context, userID uint, req *GenerateExpertImplementationPlanRequest, result *ExpertImplementationPlanResponse) error {
	if s.expertRunner == nil || req == nil || result == nil || len(req.ExpertIDs) == 0 {
		return nil
	}
	repositoryID := ""
	if req.Repository != nil {
		repositoryID = strings.TrimSpace(req.Repository.RepositoryID)
		if repositoryID == "" {
			repositoryID = strings.TrimSpace(req.Repository.FullName)
		}
	}
	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "standard"
	}
	expertBundle, err := s.expertRunner.RunPlanningExperts(ctx, userID, &domain.SpecForgeExpertPlanningRequest{
		ExpertIDs:    req.ExpertIDs,
		RepositoryID: repositoryID,
		Idea:         req.Idea,
		Mode:         "expert_implementation_plan:" + mode,
		Context: map[string]any{
			"provider":       result.Provider,
			"model":          result.Model,
			"tool_name":      result.ToolCall.Name,
			"tool_call_id":   result.ToolCall.ID,
			"finish_reason":  result.ToolCall.FinishReason,
			"selected_count": len(req.ExpertIDs),
		},
	})
	if err != nil {
		return fmt.Errorf("record expert implementation plan runs: %w", err)
	}
	for _, run := range expertBundle.Runs {
		if run != nil && run.ID != 0 {
			result.ExpertRunRefs = append(result.ExpertRunRefs, agentcontract.FormatExpertRunRef(run.ID))
		}
	}
	result.ExpertRunRefs = normalizePlanList(result.ExpertRunRefs)
	result.SkillVersionRefs = normalizePlanList(append(result.SkillVersionRefs, expertBundle.SkillVersionRefs...))
	return nil
}

func buildDeepSeekExpertPlanRequest(req *GenerateExpertImplementationPlanRequest, mode, model string) (*deepSeekChatRequest, error) {
	type deepSeekSkill struct {
		Name         string   `json:"name"`
		Description  string   `json:"description"`
		Content      string   `json:"content"`
		TargetAgents []string `json:"target_agents"`
	}
	skills := make([]deepSeekSkill, 0, len(req.Skills))
	for _, skill := range req.Skills {
		skills = append(skills, deepSeekSkill{
			Name:         strings.TrimSpace(skill.Name),
			Description:  truncateExpertText(skill.Description, 800),
			Content:      truncateExpertText(skill.Content, 2400),
			TargetAgents: skill.TargetAgents,
		})
	}
	userPayload := map[string]any{
		"idea":            strings.TrimSpace(req.Idea),
		"mode":            mode,
		"repository":      req.Repository,
		"skills":          skills,
		"output_language": "zh-Hans",
		"planning_rules": []string{
			"方案必须按 reviewable PR 拆分，不要给大而空的阶段。",
			"每个 milestone 必须包含交付物、验收标准、建议文件范围和测试策略。",
			"必须说明每个专家 skill 如何约束方案。",
			"不确定信息放到 open_questions，不要编造外部事实。",
		},
	}
	userContent, err := json.MarshalIndent(userPayload, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("marshal expert user payload: %w", err)
	}
	return &deepSeekChatRequest{
		Model: model,
		Messages: []deepSeekMessage{
			{
				Role:    "system",
				Content: "你是 CodingCTO 的专家编排器。你必须把产品 idea 和专家 skill 转成可执行、可审查、可交给 Coding Agent 的实施方案。只通过工具调用返回结构化结果，不要直接写自由文本。",
			},
			{Role: "user", Content: string(userContent)},
		},
		Tools: []deepSeekTool{expertPlanTool()},
		ToolChoice: map[string]any{
			"type": "function",
			"function": map[string]any{
				"name": expertPlanToolName,
			},
		},
		Thinking: map[string]string{
			"type": "disabled",
		},
		Temperature: 0.2,
		MaxTokens:   4096,
	}, nil
}

func expertPlanTool() deepSeekTool {
	return deepSeekTool{
		Type: "function",
		Function: deepSeekToolFunction{
			Name:        expertPlanToolName,
			Description: "Return a structured CodingCTO implementation plan from an idea and expert skills.",
			Parameters: map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"properties": map[string]any{
					"title":        map[string]any{"type": "string"},
					"summary":      map[string]any{"type": "string"},
					"problem":      map[string]any{"type": "string"},
					"target_users": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
					"scope": map[string]any{
						"type":                 "object",
						"additionalProperties": false,
						"properties": map[string]any{
							"in_scope":     map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
							"out_of_scope": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
						},
						"required": []string{"in_scope", "out_of_scope"},
					},
					"expert_skills": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type":                 "object",
							"additionalProperties": false,
							"properties": map[string]any{
								"name":        map[string]any{"type": "string"},
								"how_applied": map[string]any{"type": "string"},
								"constraints": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
							},
							"required": []string{"name", "how_applied", "constraints"},
						},
					},
					"architecture": map[string]any{
						"type":                 "object",
						"additionalProperties": false,
						"properties": map[string]any{
							"modules":   map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
							"data_flow": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
							"apis":      map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
							"risks":     map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
						},
						"required": []string{"modules", "data_flow", "apis", "risks"},
					},
					"milestones": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type":                 "object",
							"additionalProperties": false,
							"properties": map[string]any{
								"id":                  map[string]any{"type": "string"},
								"title":               map[string]any{"type": "string"},
								"deliverables":        map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
								"acceptance_criteria": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
								"files":               map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
								"tests":               map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
							},
							"required": []string{"id", "title", "deliverables", "acceptance_criteria", "files", "tests"},
						},
					},
					"risks": map[string]any{
						"type": "array",
						"items": map[string]any{
							"type":                 "object",
							"additionalProperties": false,
							"properties": map[string]any{
								"risk":       map[string]any{"type": "string"},
								"mitigation": map[string]any{"type": "string"},
							},
							"required": []string{"risk", "mitigation"},
						},
					},
					"open_questions": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
					"next_steps":     map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
				},
				"required": []string{"title", "summary", "problem", "target_users", "scope", "expert_skills", "architecture", "milestones", "risks", "open_questions", "next_steps"},
			},
		},
	}
}

func findExpertPlanToolCall(completion deepSeekChatResponse) (deepSeekToolCall, string, bool) {
	for _, choice := range completion.Choices {
		for _, call := range choice.Message.ToolCalls {
			if call.Function.Name == expertPlanToolName {
				return call, choice.FinishReason, true
			}
		}
	}
	return deepSeekToolCall{}, "", false
}

func (a *expertPlanToolAccumulator) consume(chunk deepSeekStreamChunk) bool {
	changed := false
	for _, choice := range chunk.Choices {
		if choice.FinishReason != "" {
			a.finishReason = choice.FinishReason
		}
		if choice.Delta.Content != "" {
			a.content.WriteString(choice.Delta.Content)
		}
		for _, call := range choice.Delta.ToolCalls {
			if call.ID != "" {
				a.id = call.ID
			}
			if call.Function.Name != "" {
				a.name = call.Function.Name
			}
			if call.Function.Arguments != "" {
				a.arguments.WriteString(call.Function.Arguments)
				changed = true
			}
		}
	}
	return changed
}

func (chunk deepSeekStreamChunk) hasReasoning() bool {
	for _, choice := range chunk.Choices {
		if strings.TrimSpace(choice.Delta.ReasoningContent) != "" {
			return true
		}
	}
	return false
}

func (a *expertPlanToolAccumulator) response() (*ExpertImplementationPlanResponse, error) {
	name := expertEnvOrDefaultString(a.name, expertPlanToolName)
	arguments := a.arguments.String()
	if name != expertPlanToolName || strings.TrimSpace(arguments) == "" {
		return nil, fmt.Errorf("%w: %s", ErrExpertToolCallMissing, truncateExpertText(a.content.String(), 1200))
	}

	var plan ExpertImplementationPlan
	if err := json.Unmarshal([]byte(arguments), &plan); err != nil {
		return nil, fmt.Errorf("%w: parse streamed tool arguments: %v", ErrExpertProviderFailed, err)
	}
	normalizeExpertPlan(&plan)

	return &ExpertImplementationPlanResponse{
		Plan:     &plan,
		Markdown: renderExpertPlanMarkdown(&plan),
		Provider: "deepseek",
		Model:    expertEnvOrDefaultString(a.model, deepSeekDefaultModel),
		ToolCall: ExpertToolCallResponse{
			Name:         expertPlanToolName,
			ID:           a.id,
			FinishReason: a.finishReason,
		},
		Usage: a.usage,
	}, nil
}

func expertCompletionContent(completion deepSeekChatResponse) string {
	for _, choice := range completion.Choices {
		if strings.TrimSpace(choice.Message.Content) != "" {
			return choice.Message.Content
		}
	}
	return "no tool call returned"
}

func normalizeExpertPlan(plan *ExpertImplementationPlan) {
	if strings.TrimSpace(plan.Title) == "" {
		plan.Title = "实施方案"
	}
	plan.TargetUsers = nonNilStrings(plan.TargetUsers)
	plan.Scope.InScope = nonNilStrings(plan.Scope.InScope)
	plan.Scope.OutOfScope = nonNilStrings(plan.Scope.OutOfScope)
	plan.ExpertSkills = nonNilSkillUses(plan.ExpertSkills)
	plan.Architecture.Modules = nonNilStrings(plan.Architecture.Modules)
	plan.Architecture.DataFlow = nonNilStrings(plan.Architecture.DataFlow)
	plan.Architecture.APIs = nonNilStrings(plan.Architecture.APIs)
	plan.Architecture.Risks = nonNilStrings(plan.Architecture.Risks)
	plan.Milestones = nonNilMilestones(plan.Milestones)
	plan.Risks = nonNilPlanRisks(plan.Risks)
	plan.OpenQuestions = nonNilStrings(plan.OpenQuestions)
	plan.NextSteps = nonNilStrings(plan.NextSteps)
}

func renderExpertPlanMarkdown(plan *ExpertImplementationPlan) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n", plan.Title)
	fmt.Fprintf(&b, "## 摘要\n%s\n\n", plan.Summary)
	fmt.Fprintf(&b, "## 问题定义\n%s\n\n", plan.Problem)
	b.WriteString("## 用户与范围\n")
	b.WriteString("**目标用户**\n")
	b.WriteString(renderExpertList(plan.TargetUsers))
	b.WriteString("\n\n**范围内**\n")
	b.WriteString(renderExpertList(plan.Scope.InScope))
	b.WriteString("\n\n**范围外**\n")
	b.WriteString(renderExpertList(plan.Scope.OutOfScope))
	b.WriteString("\n\n## 专家 Skill 应用\n")
	if len(plan.ExpertSkills) == 0 {
		b.WriteString("- 暂无\n")
	} else {
		for _, skill := range plan.ExpertSkills {
			fmt.Fprintf(&b, "- **%s**：%s", skill.Name, skill.HowApplied)
			if len(skill.Constraints) > 0 {
				fmt.Fprintf(&b, "\n  - 约束：%s", strings.Join(skill.Constraints, "；"))
			}
			b.WriteString("\n")
		}
	}
	b.WriteString("\n## 架构方案\n")
	b.WriteString("**模块**\n")
	b.WriteString(renderExpertList(plan.Architecture.Modules))
	b.WriteString("\n\n**数据流**\n")
	b.WriteString(renderExpertList(plan.Architecture.DataFlow))
	b.WriteString("\n\n**API / 合约**\n")
	b.WriteString(renderExpertList(plan.Architecture.APIs))
	b.WriteString("\n\n**架构风险**\n")
	b.WriteString(renderExpertList(plan.Architecture.Risks))
	b.WriteString("\n\n## 实施里程碑\n")
	if len(plan.Milestones) == 0 {
		b.WriteString("- 暂无\n")
	} else {
		for _, milestone := range plan.Milestones {
			fmt.Fprintf(&b, "### %s. %s\n\n", milestone.ID, milestone.Title)
			b.WriteString("**交付物**\n")
			b.WriteString(renderExpertList(milestone.Deliverables))
			b.WriteString("\n\n**验收标准**\n")
			b.WriteString(renderExpertList(milestone.AcceptanceCriteria))
			b.WriteString("\n\n**建议文件**\n")
			b.WriteString(renderExpertList(milestone.Files))
			b.WriteString("\n\n**测试**\n")
			b.WriteString(renderExpertList(milestone.Tests))
			b.WriteString("\n\n")
		}
	}
	b.WriteString("## 风险与缓解\n")
	if len(plan.Risks) == 0 {
		b.WriteString("- 暂无\n")
	} else {
		for _, item := range plan.Risks {
			fmt.Fprintf(&b, "- %s：%s\n", item.Risk, item.Mitigation)
		}
	}
	b.WriteString("\n## 待确认问题\n")
	b.WriteString(renderExpertList(plan.OpenQuestions))
	b.WriteString("\n\n## 下一步\n")
	b.WriteString(renderExpertList(plan.NextSteps))
	b.WriteString("\n")
	return b.String()
}

func renderExpertList(items []string) string {
	if len(items) == 0 {
		return "- 暂无"
	}
	lines := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" {
			lines = append(lines, "- "+item)
		}
	}
	if len(lines) == 0 {
		return "- 暂无"
	}
	return strings.Join(lines, "\n")
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func nonNilSkillUses(values []ExpertSkillUse) []ExpertSkillUse {
	if values == nil {
		return []ExpertSkillUse{}
	}
	for i := range values {
		values[i].Constraints = nonNilStrings(values[i].Constraints)
	}
	return values
}

func nonNilMilestones(values []ExpertMilestone) []ExpertMilestone {
	if values == nil {
		return []ExpertMilestone{}
	}
	for i := range values {
		values[i].Deliverables = nonNilStrings(values[i].Deliverables)
		values[i].AcceptanceCriteria = nonNilStrings(values[i].AcceptanceCriteria)
		values[i].Files = nonNilStrings(values[i].Files)
		values[i].Tests = nonNilStrings(values[i].Tests)
	}
	return values
}

func nonNilPlanRisks(values []ExpertPlanRisk) []ExpertPlanRisk {
	if values == nil {
		return []ExpertPlanRisk{}
	}
	return values
}

func truncateExpertText(value string, max int) string {
	value = strings.TrimSpace(value)
	if len(value) <= max {
		return value
	}
	return value[:max] + "..."
}

func expertEnvOrDefault(key, fallback string) string {
	return expertEnvOrDefaultString(os.Getenv(key), fallback)
}

func expertEnvOrDefaultString(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}
