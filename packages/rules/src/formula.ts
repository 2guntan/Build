/**
 * Tiny safe expression parser for rule formulas such as "max(5, H/2)".
 * Grammar: expr := term (('+'|'-') term)*; term := factor (('*'|'/') factor)*;
 * factor := unary ('^' factor)?; unary := '-' unary | primary;
 * primary := number | ident | ident '(' args ')' | '(' expr ')'.
 * No eval, no property access.
 */
export type FormulaVars = Record<string, number>;

const FUNCS: Record<string, (...a: number[]) => number> = {
  max: Math.max,
  min: Math.min,
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  sqrt: Math.sqrt,
};

export class FormulaError extends Error {}

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      const m = /^\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(src.slice(i));
      if (!m) throw new FormulaError(`Bad number at ${i}`);
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
    } else if ('+-*/^(),'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
    } else {
      throw new FormulaError(`Unexpected character "${c}"`);
    }
  }
  return out;
}

export function evaluateFormula(src: string | number, vars: FormulaVars = {}): number {
  if (typeof src === 'number') return src;
  if (src.length > 200) throw new FormulaError('Formula too long');
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => {
    const t = toks[p];
    if (!t || (v !== undefined && t.v !== v)) throw new FormulaError(`Expected ${v ?? 'token'}`);
    p++;
    return t;
  };
  const expr = (): number => {
    let v = term();
    for (let t = peek(); t && t.t === 'op' && (t.v === '+' || t.v === '-'); t = peek()) {
      p++;
      v = t.v === '+' ? v + term() : v - term();
    }
    return v;
  };
  const term = (): number => {
    let v = factor();
    for (let t = peek(); t && t.t === 'op' && (t.v === '*' || t.v === '/'); t = peek()) {
      p++;
      v = t.v === '*' ? v * factor() : v / factor();
    }
    return v;
  };
  const factor = (): number => {
    const b = unary();
    const t = peek();
    if (t && t.t === 'op' && t.v === '^') {
      p++;
      return b ** factor();
    }
    return b;
  };
  const unary = (): number => {
    const t = peek();
    if (t && t.t === 'op' && t.v === '-') {
      p++;
      return -unary();
    }
    return primary();
  };
  const primary = (): number => {
    const t = eat();
    if (t.t === 'num') return t.v;
    if (t.t === 'op' && t.v === '(') {
      const v = expr();
      eat(')');
      return v;
    }
    if (t.t === 'id') {
      const n = peek();
      if (n && n.t === 'op' && n.v === '(') {
        const fn = FUNCS[t.v];
        if (!fn) throw new FormulaError(`Unknown function ${t.v}`);
        p++;
        const args: number[] = [];
        if (!(peek()?.t === 'op' && peek()?.v === ')')) {
          args.push(expr());
          while (peek()?.t === 'op' && peek()?.v === ',') {
            p++;
            args.push(expr());
          }
        }
        eat(')');
        return fn(...args);
      }
      if (!(t.v in vars)) throw new FormulaError(`Unknown variable ${t.v}`);
      return vars[t.v]!;
    }
    throw new FormulaError(`Unexpected ${t.v}`);
  };
  const v = expr();
  if (p !== toks.length) throw new FormulaError('Trailing input');
  if (!Number.isFinite(v)) throw new FormulaError('Result is not finite');
  return v;
}

/** Validates a formula's syntax with dummy variables. */
export function checkFormula(src: string | number): string | null {
  try {
    evaluateFormula(src, { H: 10, n: 3, A: 1000 });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
