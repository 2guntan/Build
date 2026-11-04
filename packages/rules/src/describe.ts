import type { Rule, RuleSet, Zone } from './schema.js';

/** Plain-language description of a rule, used in the agent context and the UI. */
export function describeRule(r: Rule, lang: 'fr' | 'en' = 'fr'): string {
  const fr = lang === 'fr';
  const sev = r.severity === 'blocking' ? (fr ? 'bloquant' : 'blocking') : fr ? 'avertissement' : 'warning';
  const cite = `[${r.cite.source} ${r.cite.article}]`;
  let body: string;
  switch (r.type) {
    case 'max_coverage':
      body = fr ? `Emprise au sol ≤ ${r.max * 100} % de la parcelle` : `Coverage ≤ ${r.max * 100}% of plot`;
      break;
    case 'max_far':
      body = fr ? `COS ≤ ${r.max}` : `FAR ≤ ${r.max}`;
      break;
    case 'max_height':
      body = [
        r.maxMetres !== undefined ? (fr ? `hauteur ≤ ${r.maxMetres} m` : `height ≤ ${r.maxMetres} m`) : '',
        r.maxStoreys !== undefined ? (fr ? `${r.maxStoreys} niveaux max` : `max ${r.maxStoreys} storeys`) : '',
      ]
        .filter(Boolean)
        .join(', ');
      break;
    case 'setback':
      body = fr ? `Recul ${r.edge} ≥ ${r.min} m` : `${r.edge} setback ≥ ${r.min} m`;
      break;
    case 'min_separation':
      body = fr ? `Distance entre bâtiments ≥ ${r.min} m` : `Separation between blocks ≥ ${r.min} m`;
      break;
    case 'parking_ratio':
      body =
        (fr ? 'Stationnement : ' : 'Parking: ') +
        Object.entries(r.perUse)
          .map(([u, q]) =>
            [q.per100m2 !== undefined ? `${u} ${q.per100m2}/100 m²` : '', q.perUnit !== undefined ? `${u} ${q.perUnit}/${fr ? 'logement' : 'unit'}` : '']
              .filter(Boolean)
              .join(', '),
          )
          .join('; ');
      break;
    case 'min_open_space':
      body = fr ? `Espace libre ≥ ${r.min * 100} %` : `Open space ≥ ${r.min * 100}%`;
      break;
  }
  return `${r.id}: ${body} (${sev}) ${cite}`;
}

export function describeZone(rs: RuleSet, zone: Zone, lang: 'fr' | 'en' = 'fr'): string {
  const head = `${rs.jurisdiction.id} v${rs.jurisdiction.version} — ${zone.name}${rs.test ? ' — TEST, NON OFFICIEL' : ''}`;
  return [head, ...zone.rules.map((r) => `- ${describeRule(r, lang)}`)].join('\n');
}
