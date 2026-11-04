import type { Recipe, SiteInput } from '@fs/recipe';
import type { RuleSet, Zone } from '@fs/rules';
import type { Candidate, RecipeBase } from '@fs/solver';
import type { ContextPrism } from '@fs/sun';
import type { YieldAssumptions } from '@fs/yield';

/** Everything the agent's tools can see. Built per run, scoped to one option of one project. */
export interface AgentWorkspace {
  site: SiteInput;
  zone: Zone;
  ruleSet: RuleSet;
  isTest: boolean;
  recipe: Recipe | null;
  assumptions: Partial<YieldAssumptions>;
  base: RecipeBase;
  context: ContextPrism[];
  lat: number;
  lon: number;
  nonCompliantStudy: boolean;
  /** Candidates produced during this run, by id. */
  candidates: Map<string, AgentCandidate>;
  /** Most recent candidate the agent produced or edited (proposed by default). */
  lastCandidateId: string | null;
  editCounter: number;
}

export interface AgentCandidate {
  id: string;
  template: string;
  recipe: Recipe;
  metrics: Candidate['metrics'];
  compliance: Candidate['compliance'];
  yield: Candidate['yield'];
}
