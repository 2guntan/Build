import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { auth, problemMessage } from '../api/client';
import { Button, Field, Input } from '../components/ui';
import { AuthShell } from './LoginPage';

export default function SignupPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <AuthShell title={t('auth.signup')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await auth.signUp(form);
            await qc.invalidateQueries();
            void nav('/');
          } catch (err) {
            setError(problemMessage(err, i18n.language));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('auth.name')}>
          <Input required autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label={t('auth.email')}>
          <Input type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label={t('auth.password')}>
          <Input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <Button variant="primary" className="w-full" disabled={busy}>{t('auth.signup')}</Button>
      </form>
      <p className="text-sm text-muted">
        {t('auth.haveAccount')} <Link className="text-accent underline" to="/login">{t('auth.login')}</Link>
      </p>
    </AuthShell>
  );
}
