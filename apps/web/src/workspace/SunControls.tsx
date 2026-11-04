import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUN_PRESETS } from '@fs/sun';
import { useDesignStore } from '../state/design-store';
import { buildWorker } from '../workers/client';
import { Button } from '../components/ui';
import { num, pct } from '../lib/format';
import { useSunStore } from './sun-store';

const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

export function SunControls() {
  const { t, i18n } = useTranslation();
  const s = useSunStore();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!s.playing) return;
    // Animate the day in 15-minute steps.
    const id = setInterval(() => {
      const h = useSunStore.getState().hour + 0.25;
      useSunStore.getState().setHour(h > 19 ? 6 : h);
    }, 250);
    return () => clearInterval(id);
  }, [s.playing]);

  const runMap = async () => {
    const d = useDesignStore.getState();
    if (!d.recipe || !d.site) return;
    setBusy(true);
    try {
      const r = await buildWorker().sunHours(d.recipe, d.site, d.context, s.date, s.lat, s.lon);
      s.setMap(r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line bg-panel px-3 py-2 text-xs">
      <label className="flex items-center gap-1.5">
        <input type="checkbox" checked={s.enabled} onChange={(e) => s.setEnabled(e.target.checked)} />
        {t('workspace.sun')}
      </label>
      {s.enabled && (
        <>
          <select
            aria-label={t('sun.date')}
            className="rounded border border-line px-1 py-0.5"
            value={`${s.date.month}-${s.date.day}`}
            onChange={(e) => {
              const [m, d] = e.target.value.split('-').map(Number);
              s.setDate({ year: s.date.year, month: m!, day: d! });
            }}
          >
            {SUN_PRESETS.map((p) => (
              <option key={`${p.month}-${p.day}`} value={`${p.month}-${p.day}`}>
                {new Date(Date.UTC(2026, p.month - 1, p.day)).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' })}
              </option>
            ))}
          </select>
          <input
            aria-label={t('sun.time')}
            type="range"
            min={6}
            max={19}
            step={0.25}
            value={s.hour}
            onChange={(e) => s.setHour(Number(e.target.value))}
            className="w-40"
          />
          <span className="w-10 tabular-nums">{hhmm(s.hour)}</span>
          <Button onClick={() => s.setPlaying(!s.playing)}>{s.playing ? t('sun.pause') : t('sun.play')}</Button>
          <Button onClick={runMap} disabled={busy}>{busy ? t('sun.running') : t('sun.run')}</Button>
          {s.map && (
            <span className="flex flex-wrap gap-3 text-muted">
              <span>
                {t('sun.facade')} : {Object.entries(s.map.summary.avgFacadeHoursByOrientation).map(([o, h]) => `${o} ${num(h, 1)}`).join(' · ')}
              </span>
              <span>{t('sun.groundUnder2h')} {pct(s.map.summary.groundShareUnder2h)}</span>
              <span>{t('sun.facadeOver6h')} {pct(s.map.summary.facadeShareOver6h)}</span>
              <span>{t('sun.shadedNoon')} {pct(s.map.summary.plotShadedAtNoon)}</span>
              <span className="flex items-center gap-1">
                0 h <span className="h-2 w-16 rounded" style={{ background: 'linear-gradient(90deg,#1f2973,#268c99,#f2cc33,#fa731a)' }} /> 12 h
              </span>
            </span>
          )}
        </>
      )}
    </div>
  );
}
