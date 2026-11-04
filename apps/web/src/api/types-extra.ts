import type { RuleSet } from '@fs/rules';

export * from './types';

export interface RuleSetDto {
  id: string;
  jurisdictionId: string;
  version: string;
  status: 'draft' | 'published';
  isTest: boolean;
  content: RuleSet;
}
