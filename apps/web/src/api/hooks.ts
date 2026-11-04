import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Assumptions, ContextDto, Jurisdiction, OptionDto, OptionWithHead, ProjectDto, RuleSetDto } from './types-extra';

export const keys = {
  me: ['me'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  options: (pid: string) => ['options', pid] as const,
  option: (id: string) => ['option', id] as const,
  versions: (id: string) => ['versions', id] as const,
  context: (pid: string) => ['context', pid] as const,
  jurisdictions: ['jurisdictions'] as const,
  ruleSet: (id: string) => ['ruleSet', id] as const,
  assumptions: (pid: string) => ['assumptions', pid] as const,
};

export interface Me {
  user: { id: string; name: string; email: string };
  organizations: { id: string; name: string; role: string }[];
}

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/me'), retry: false });
export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: () => api<ProjectDto[]>('/projects') });
export const useProject = (id: string) => useQuery({ queryKey: keys.project(id), queryFn: () => api<ProjectDto>(`/projects/${id}`) });
export const useOptions = (pid: string) => useQuery({ queryKey: keys.options(pid), queryFn: () => api<OptionDto[]>(`/projects/${pid}/options`) });
export const useOption = (id: string | null) =>
  useQuery({ queryKey: keys.option(id ?? ''), queryFn: () => api<OptionWithHead>(`/options/${id}`), enabled: !!id });
export const useVersions = (id: string | null) =>
  useQuery({
    queryKey: keys.versions(id ?? ''),
    queryFn: () => api<{ id: string; parentId: string | null; authorKind: string; summary: string | null; createdAt: string }[]>(`/options/${id}/versions`),
    enabled: !!id,
  });
export const useContext = (pid: string) =>
  useQuery({
    queryKey: keys.context(pid),
    queryFn: () => api<ContextDto>(`/projects/${pid}/context`),
    refetchInterval: (q) => (q.state.data?.import && ['queued', 'running'].includes(q.state.data.import.status) ? 2000 : false),
  });
export const useJurisdictions = () => useQuery({ queryKey: keys.jurisdictions, queryFn: () => api<Jurisdiction[]>('/jurisdictions') });
export const useRuleSet = (id: string | null | undefined) =>
  useQuery({ queryKey: keys.ruleSet(id ?? ''), queryFn: () => api<RuleSetDto>(`/rule-sets/${id}`), enabled: !!id, staleTime: Infinity });
export const useAssumptions = (pid: string) => useQuery({ queryKey: keys.assumptions(pid), queryFn: () => api<Assumptions>(`/projects/${pid}/yield-assumptions`) });

export function useInvalidate() {
  const qc = useQueryClient();
  return (key: readonly unknown[]) => qc.invalidateQueries({ queryKey: key });
}

export function useCreateOption(pid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { name: string; duplicateFrom?: string }) => api<OptionDto>(`/projects/${pid}/options`, { method: 'POST', body: b }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.options(pid) }),
  });
}
