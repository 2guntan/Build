import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { auth } from '../api/client';
import { setLanguage } from '../i18n';

export function AppHeader({ children }: { children?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  return (
    <header className="flex h-12 items-center gap-3 border-b border-line bg-panel px-4">
      <Link to="/" className="flex items-center gap-2 font-semibold">
        <img src="/favicon.svg" alt="" className="h-6 w-6" />
        {t('app.name')}
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
      <select
        aria-label={t('app.language')}
        className="rounded border border-line bg-panel px-1.5 py-1 text-xs"
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value as 'fr' | 'en')}
      >
        <option value="fr">FR</option>
        <option value="en">EN</option>
      </select>
      <button
        className="text-xs text-muted hover:text-ink"
        onClick={async () => {
          await auth.signOut().catch(() => undefined);
          qc.clear();
          void nav('/login');
        }}
      >
        {t('auth.logout')}
      </button>
    </header>
  );
}
