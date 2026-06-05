package expert

import (
	"github.com/gin-gonic/gin"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
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

func (h *Handler) Name() string { return "expert" }

func (h *Handler) ListExperts(c *gin.Context) {
	activeOnly := c.Query("active") == "true"
	experts, err := h.service.ListExperts(c.Request.Context(), activeOnly)
	if err != nil {
		response.HandleError(c, "Failed to list experts", err)
		return
	}
	response.Success(c, &ListExpertsResponse{Experts: experts})
}

func (h *Handler) UpsertExpert(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	var req UpsertExpertRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	expert, err := h.service.UpsertExpert(c.Request.Context(), userID, &req)
	if err != nil {
		response.HandleError(c, "Failed to upsert expert", err)
		return
	}
	response.Created(c, &ExpertResponse{Expert: expert})
}

func (h *Handler) GetExpert(c *gin.Context) {
	expertID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	expert, err := h.service.GetExpert(c.Request.Context(), expertID)
	if err != nil {
		response.HandleError(c, "Failed to get expert", err)
		return
	}
	response.Success(c, &ExpertResponse{Expert: expert})
}

func (h *Handler) ListExpertSkills(c *gin.Context) {
	expertID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	skills, err := h.service.ListExpertSkills(c.Request.Context(), expertID)
	if err != nil {
		response.HandleError(c, "Failed to list expert skills", err)
		return
	}
	response.Success(c, &ListExpertSkillsResponse{Skills: skills})
}

func (h *Handler) UpsertExpertSkill(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	expertID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	var req UpsertExpertSkillRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	skill, err := h.service.UpsertExpertSkill(c.Request.Context(), userID, expertID, &req)
	if err != nil {
		response.HandleError(c, "Failed to upsert expert skill", err)
		return
	}
	response.Created(c, &ExpertSkillResponse{Skill: skill})
}

func (h *Handler) ListSkillVersions(c *gin.Context) {
	skillID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	versions, err := h.service.ListSkillVersions(c.Request.Context(), skillID)
	if err != nil {
		response.HandleError(c, "Failed to list skill versions", err)
		return
	}
	response.Success(c, &ListExpertSkillVersionsResponse{Versions: versions})
}

func (h *Handler) CreateSkillVersion(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	skillID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	var req CreateExpertSkillVersionRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	version, err := h.service.CreateSkillVersion(c.Request.Context(), userID, skillID, &req)
	if err != nil {
		response.HandleError(c, "Failed to create skill version", err)
		return
	}
	response.Created(c, &ExpertSkillVersionResponse{Version: version})
}

func (h *Handler) ListExpertRuns(c *gin.Context) {
	expertID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	runs, err := h.service.ListExpertRuns(c.Request.Context(), expertID)
	if err != nil {
		response.HandleError(c, "Failed to list expert runs", err)
		return
	}
	response.Success(c, &ListExpertRunsResponse{Runs: runs})
}

func (h *Handler) CreateEvolutionProposal(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	skillID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	var req CreateEvolutionProposalRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	proposal, err := h.service.CreateEvolutionProposal(c.Request.Context(), userID, skillID, &req)
	if err != nil {
		response.HandleError(c, "Failed to create evolution proposal", err)
		return
	}
	response.Created(c, &EvolutionProposalResponse{Proposal: proposal})
}

func (h *Handler) ListEvolutionProposals(c *gin.Context) {
	skillID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	proposals, err := h.service.ListEvolutionProposals(c.Request.Context(), skillID)
	if err != nil {
		response.HandleError(c, "Failed to list evolution proposals", err)
		return
	}
	response.Success(c, &ListEvolutionProposalsResponse{Proposals: proposals})
}

func (h *Handler) ApproveEvolutionProposal(c *gin.Context) {
	h.reviewEvolutionProposal(c, "approve")
}

func (h *Handler) RejectEvolutionProposal(c *gin.Context) {
	h.reviewEvolutionProposal(c, "reject")
}

func (h *Handler) PromoteEvolutionProposal(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	proposalID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	version, err := h.service.PromoteEvolutionProposal(c.Request.Context(), userID, proposalID)
	if err != nil {
		response.HandleError(c, "Failed to promote evolution proposal", err)
		return
	}
	response.Success(c, &ExpertSkillVersionResponse{Version: version})
}

func (h *Handler) reviewEvolutionProposal(c *gin.Context, action string) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	proposalID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	var proposal *domain.CodingCTOSkillEvolutionProposal
	var err error
	if action == "approve" {
		proposal, err = h.service.ApproveEvolutionProposal(c.Request.Context(), userID, proposalID)
	} else {
		proposal, err = h.service.RejectEvolutionProposal(c.Request.Context(), userID, proposalID)
	}
	if err != nil {
		response.HandleError(c, "Failed to review evolution proposal", err)
		return
	}
	response.Success(c, &EvolutionProposalResponse{Proposal: proposal})
}
