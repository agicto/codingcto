package planning

import (
	"github.com/gin-gonic/gin"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/pkg/handler"
	"github.com/zgiai/luas/api/pkg/response"
)

type Handler struct {
	service Service
}

var (
	_ contracts.Module      = (*Handler)(nil)
	_ contracts.RouteModule = (*Handler)(nil)
)

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Name() string {
	return "planning"
}

func (h *Handler) CreateIdea(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	var req CreateIdeaRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	bundle, err := h.service.CreateIdea(c.Request.Context(), userID, c.Param("repo_id"), &req)
	if err != nil {
		response.HandleError(c, "Failed to create idea", err)
		return
	}

	response.Created(c, toPlanReviewResponse(bundle))
}

func (h *Handler) CreateProjectIdea(c *gin.Context) {
	h.CreateProjectRequirement(c)
}

func (h *Handler) CreateProjectRequirement(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req CreateIdeaRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	bundle, err := h.service.CreateProjectRequirement(c.Request.Context(), userID, projectID, &req)
	if err != nil {
		response.HandleError(c, "Failed to create project requirement", err)
		return
	}

	response.Created(c, toPlanReviewResponse(bundle))
}

func (h *Handler) GenerateRequirementPlan(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	requirementID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req CreateIdeaRequest
	if c.Request.ContentLength > 0 && !handler.BindJSON(c, &req) {
		return
	}

	bundle, err := h.service.GenerateRequirementPlan(c.Request.Context(), userID, requirementID, &req)
	if err != nil {
		response.HandleError(c, "Failed to generate requirement plan", err)
		return
	}

	response.Created(c, toPlanReviewResponse(bundle))
}

func (h *Handler) GetRequirementPlan(c *gin.Context) {
	requirementID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	bundle, err := h.service.GetPlanForRequirement(c.Request.Context(), requirementID)
	if err != nil {
		response.HandleError(c, "Failed to get requirement plan", err)
		return
	}

	response.Success(c, toPlanReviewResponse(bundle))
}

func (h *Handler) GetPlan(c *gin.Context) {
	ideaID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	bundle, err := h.service.GetPlanForIdea(c.Request.Context(), ideaID)
	if err != nil {
		response.HandleError(c, "Failed to get plan", err)
		return
	}

	response.Success(c, toPlanReviewResponse(bundle))
}

func (h *Handler) ApprovePlan(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	planID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req ApprovePlanRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	bundle, err := h.service.ApprovePlan(c.Request.Context(), userID, planID, &req)
	if err != nil {
		response.HandleError(c, "Failed to approve plan", err)
		return
	}

	response.Success(c, toPlanReviewResponse(bundle))
}

func (h *Handler) UpsertSkill(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	var req UpsertSkillRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	skill, err := h.service.UpsertSkill(c.Request.Context(), userID, c.Param("repo_id"), &req)
	if err != nil {
		response.HandleError(c, "Failed to upsert skill", err)
		return
	}

	response.Created(c, &SkillResponse{Skill: skill})
}

func (h *Handler) ListSkills(c *gin.Context) {
	skills, err := h.service.ListSkills(c.Request.Context(), c.Param("repo_id"))
	if err != nil {
		response.HandleError(c, "Failed to list skills", err)
		return
	}

	response.Success(c, &SkillListResponse{Skills: skills})
}

func (h *Handler) UpsertProjectSkill(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req UpsertProjectSkillRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	projectSkill, err := h.service.UpsertProjectSkill(c.Request.Context(), userID, projectID, &req)
	if err != nil {
		response.HandleError(c, "Failed to upsert project skill", err)
		return
	}

	response.Created(c, &ProjectSkillResponse{ProjectSkill: projectSkill})
}

func (h *Handler) ListProjectSkills(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	projectSkills, err := h.service.ListProjectSkills(c.Request.Context(), projectID)
	if err != nil {
		response.HandleError(c, "Failed to list project skills", err)
		return
	}

	response.Success(c, &ProjectSkillListResponse{ProjectSkills: projectSkills})
}

func (h *Handler) ListRequirementSkillRuns(c *gin.Context) {
	requirementID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	skillRuns, err := h.service.ListSkillRunsForRequirement(c.Request.Context(), requirementID)
	if err != nil {
		response.HandleError(c, "Failed to list requirement skill runs", err)
		return
	}

	response.Success(c, &SkillRunListResponse{SkillRuns: skillRuns})
}

func (h *Handler) ListPlanSkillRuns(c *gin.Context) {
	planID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	skillRuns, err := h.service.ListSkillRunsForPlan(c.Request.Context(), planID)
	if err != nil {
		response.HandleError(c, "Failed to list plan skill runs", err)
		return
	}

	response.Success(c, &SkillRunListResponse{SkillRuns: skillRuns})
}

func (h *Handler) CompilePrompt(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	prNodeID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req CompilePromptRequest
	if c.Request.ContentLength > 0 && !handler.BindJSON(c, &req) {
		return
	}

	prompt, err := h.service.CompilePrompt(c.Request.Context(), userID, prNodeID, &req)
	if err != nil {
		response.HandleError(c, "Failed to compile prompt", err)
		return
	}

	response.Created(c, &CompiledPromptResponse{Prompt: prompt})
}
