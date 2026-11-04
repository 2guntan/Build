import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { auth, problemMessage } from '../api/client';
import { Button, Card, Field, Input } from '../components/ui';

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="font-semibold">{t('app.name')}</span>
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {children}
      </Card>
    </main>
  );
}

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell title={t('auth.login')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await auth.signIn({ email, password });
            await qc.invalidateQueries();
            void nav('/');
          } catch (err) {
            setError(problemMessage(err, i18n.language));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('auth.email')}>
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.password')}>
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <Button variant="primary" className="w-full" disabled={busy}>{t('auth.login')}</Button>
      </form>
      <Button
        className="w-full"
        onClick={async () => {
          try {
            const r = await auth.google();
            window.location.href = r.url;
          } catch (err) {
            setError(problemMessage(err, i18n.language));
          }
        }}
      >
        {t('auth.google')}
      </Button>
      <p className="text-sm text-muted">
        {t('auth.noAccount')} <Link className="text-accent underline" to="/signup">{t('auth.signup')}</Link>
      </p>
    </AuthShell>
  );
}
