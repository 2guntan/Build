import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Languages, LogOut, Moon, Search, Sun } from 'lucide-react';
import { auth } from '../api/client';
import { useMe } from '../api/hooks';
import { setLanguage } from '../i18n';
import { useViewStore } from '../state/view-store';

export function AppHeader({ children, onPalette }: { children?: ReactNode; onPalette?: () => void }) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const dark = useViewStore((s) => s.dark);
  const setView = useViewStore((s) => s.set);
  const initials = (me.data?.user.name ?? '?').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
      <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
        <img src="/favicon.svg" alt="" className="h-6 w-6" />
        <span className="hidden sm:inline">{t('app.name')}</span>
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      {onPalette && (
        <button onClick={onPalette} className="hidden items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1 text-xs text-muted hover:text-ink md:flex">
          <Search size={13} /> {t('palette.open')} <kbd className="rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
        </button>
      )}
      <button
        aria-label={t('app.language')}
        title={t('app.language')}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface hover:text-ink"
        onClick={() => setLanguage(i18n.language === 'fr' ? 'en' : 'fr')}
      >
        <Languages size={15} /> {i18n.language.toUpperCase()}
      </button>
      <button aria-label={t('app.theme')} title={t('app.theme')} className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink" onClick={() => setView('dark', !dark)}>
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <span title={me.data?.user.email} className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-ink">{initials}</span>
      <button
        aria-label={t('auth.logout')}
        title={t('auth.logout')}
        className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-ink"
        onClick={async () => {
          await auth.signOut().catch(() => undefined);
          qc.clear();
          void nav('/login');
        }}
      >
        <LogOut size={16} />
      </button>
    </header>
  );
}
