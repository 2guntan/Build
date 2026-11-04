import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import fr from '../src/locales/fr.json';
import en from '../src/locales/en.json';

const flat = (o: Record<string, unknown>, p = ''): string[] =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe('i18n', () => {
  it('fr and en have the same keys', () => {
    expect(flat(en).sort()).toEqual(flat(fr).sort());
  });
  it('every static t("…") key used in the code exists in both languages', () => {
    const keys = new Set(flat(fr));
    const missing: string[] = [];
    for (const f of files(join(import.meta.dirname, '../src'))) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) if (!keys.has(m[1]!) && !keys.has(`${m[1]}_one`)) missing.push(`${f}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
});
