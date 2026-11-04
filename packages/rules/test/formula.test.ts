import { describe, expect, it } from 'vitest';
import { evaluateFormula, FormulaError } from '../src/index.js';

describe('formula parser', () => {
  it('evaluates arithmetic, functions and variables', () => {
    expect(evaluateFormula('max(5, H/2)', { H: 20 })).toBe(10);
    expect(evaluateFormula('max(5, H/2)', { H: 6 })).toBe(5);
    expect(evaluateFormula('2 + 3 * 4 - -1')).toBe(15);
    expect(evaluateFormula('(n - 1) ^ 2', { n: 4 })).toBe(9);
    expect(evaluateFormula('min(A / 100, 12)', { A: 800 })).toBe(8);
    expect(evaluateFormula(7)).toBe(7);
  });
  it('rejects unsafe or invalid input', () => {
    for (const bad of ['process.exit()', 'H)', 'foo(1)', 'x', '1 +', 'constructor', '1/0', '"a"']) {
      expect(() => evaluateFormula(bad, { H: 1 })).toThrow(FormulaError);
    }
  });
});
