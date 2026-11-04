import testFixture from '../../../data/jurisdictions/sn-dakar/test-fixture.json' with { type: 'json' };
import referencePlots from '../../../data/reference-plots.json' with { type: 'json' };
import type { EdgeClass, Vec2 } from '@fs/recipe';
import { RuleSet } from './schema.js';

/** TEST — non-official rule set. Never present it as real Dakar rules. */
export const TEST_RULESET: RuleSet = RuleSet.parse(testFixture);

export interface ReferencePlot {
  id: string;
  name: string;
  zone: string;
  plot: Vec2[];
  edgeClasses: EdgeClass[];
  slopePercent?: number;
  context: { id: string; ring: Vec2[]; heightM: number }[];
}

export const REFERENCE_ORIGIN = referencePlots.origin;
export const REFERENCE_PLOTS = referencePlots.plots as unknown as ReferencePlot[];
