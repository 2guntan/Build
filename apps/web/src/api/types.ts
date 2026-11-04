import type { PlotSummary } from '@fs/api-contract';
import type { BuildTotals, Recipe } from '@fs/recipe';
import type { Evaluation } from '@fs/rules';
import type { YieldAssumptions, YieldResult } from '@fs/yield';

export interface ProjectDto {
  id: string;
  orgId: string;
  name: string;
  jurisdictionId: string;
  ruleSetId: string | null;
  currency: string;
  locale: string;
  archived: boolean;
  createdAt: string;
  plot: PlotSummary | null;
  bestMargin: number | null;
  ruleSetIsTest: boolean;
}

export interface OptionDto {
  id: string;
  projectId: string;
  name: string;
  ruleSetId: string | null;
  headVersionId: string | null;
  isArchived: boolean;
  nonCompliantStudy: boolean;
}

export interface VersionDto {
  id: string;
  optionId: string;
  parentId: string | null;
  recipe: Recipe;
  authorKind: 'user' | 'agent' | 'slider';
  summary: string | null;
  createdAt: string;
}

export interface EvaluationDto {
  compliance: Evaluation & { test: boolean; ruleSetId: string | null; zoneId: string | null };
  metrics: BuildTotals & { hash: string };
  yield: YieldResult;
}

export interface OptionWithHead {
  option: OptionDto;
  head: VersionDto | null;
  evaluation: EvaluationDto | null;
}

export interface Jurisdiction {
  id: string;
  name: string;
  ruleSets: { id: string; version: string; status: string; isTest: boolean; zones: { id: string; name: string; name_en?: string }[] }[];
}

export interface ContextDto {
  import: { id: string; status: string; stats: unknown; error: string | null } | null;
  buildings: { id: string; heightM: number; heightSource: string; dataSource: string; local: [number, number][] }[];
  terrain: { id: string; url: string; resolutionM: number }[];
}

export type Assumptions = Partial<YieldAssumptions>;
