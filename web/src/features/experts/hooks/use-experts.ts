'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type CreateCodingCTOExpertSkillVersionPayload,
  type CreateCodingCTOSkillEvolutionProposalPayload,
  type UpsertCodingCTOExpertPayload,
  type UpsertCodingCTOExpertSkillPayload,
  expertsService,
} from '@/features/experts/services/experts-service';

export const expertKeys = {
  all: ['experts'] as const,
  list: (activeOnly = false) => [...expertKeys.all, 'list', activeOnly] as const,
  skills: (expertId: number) => [...expertKeys.all, 'skills', expertId] as const,
  versions: (skillId: number) => [...expertKeys.all, 'skill-versions', skillId] as const,
  runs: (expertId: number) => [...expertKeys.all, 'runs', expertId] as const,
  proposals: (skillId: number) => [...expertKeys.all, 'proposals', skillId] as const,
};

export function useCodingCTOExperts(activeOnly = false) {
  return useQuery({
    queryKey: expertKeys.list(activeOnly),
    queryFn: () => expertsService.listExperts(activeOnly),
  });
}

export function useUpsertCodingCTOExpert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertCodingCTOExpertPayload) => expertsService.upsertExpert(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expertKeys.all });
    },
  });
}

export function useCodingCTOExpertSkills(expertId?: number) {
  return useQuery({
    queryKey: expertKeys.skills(expertId ?? 0),
    queryFn: () => expertsService.listExpertSkills(expertId ?? 0),
    enabled: Boolean(expertId),
  });
}

export function useUpsertCodingCTOExpertSkill(expertId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertCodingCTOExpertSkillPayload) => {
      if (!expertId) {
        throw new Error('Expert ID is required to save an expert skill.');
      }
      return expertsService.upsertExpertSkill(expertId, payload);
    },
    onSuccess: () => {
      if (expertId) {
        queryClient.invalidateQueries({ queryKey: expertKeys.skills(expertId) });
      }
    },
  });
}

export function useCodingCTOExpertSkillVersions(skillId?: number) {
  return useQuery({
    queryKey: expertKeys.versions(skillId ?? 0),
    queryFn: () => expertsService.listExpertSkillVersions(skillId ?? 0),
    enabled: Boolean(skillId),
  });
}

export function useCreateCodingCTOExpertSkillVersion(skillId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCodingCTOExpertSkillVersionPayload) => {
      if (!skillId) {
        throw new Error('Skill ID is required to create a skill version.');
      }
      return expertsService.createExpertSkillVersion(skillId, payload);
    },
    onSuccess: () => {
      if (skillId) {
        queryClient.invalidateQueries({ queryKey: expertKeys.versions(skillId) });
      }
    },
  });
}

export function useCodingCTOExpertRuns(expertId?: number) {
  return useQuery({
    queryKey: expertKeys.runs(expertId ?? 0),
    queryFn: () => expertsService.listExpertRuns(expertId ?? 0),
    enabled: Boolean(expertId),
  });
}

export function useCodingCTOSkillEvolutionProposals(skillId?: number) {
  return useQuery({
    queryKey: expertKeys.proposals(skillId ?? 0),
    queryFn: () => expertsService.listEvolutionProposals(skillId ?? 0),
    enabled: Boolean(skillId),
  });
}

export function useCreateCodingCTOSkillEvolutionProposal(skillId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCodingCTOSkillEvolutionProposalPayload) => {
      if (!skillId) {
        throw new Error('Skill ID is required to propose skill evolution.');
      }
      return expertsService.createEvolutionProposal(skillId, payload);
    },
    onSuccess: () => {
      if (skillId) {
        queryClient.invalidateQueries({ queryKey: expertKeys.proposals(skillId) });
      }
    },
  });
}

export function usePromoteCodingCTOSkillEvolutionProposal(skillId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: number) => expertsService.promoteEvolutionProposal(proposalId),
    onSuccess: () => {
      if (skillId) {
        queryClient.invalidateQueries({ queryKey: expertKeys.proposals(skillId) });
        queryClient.invalidateQueries({ queryKey: expertKeys.versions(skillId) });
      }
    },
  });
}
