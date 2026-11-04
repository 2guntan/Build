import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { UserPlus, Users, X } from 'lucide-react';
import { api, problemMessage } from '../api/client';
import { useMe } from '../api/hooks';
import { Button, Card, Input } from './ui';

interface Members {
  organization: { id: string; name: string };
  members: { userId: string; role: 'owner' | 'editor' | 'viewer'; name: string; email: string }[];
}

export function MembersCard({ orgId }: { orgId: string }) {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['members', orgId], queryFn: () => api<Members>(`/orgs/${orgId}/members`) });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer' | 'owner'>('editor');
  const isOwner = q.data?.members.find((m) => m.userId === me.data?.user.id)?.role === 'owner';
  const refresh = () => qc.invalidateQueries({ queryKey: ['members', orgId] });
  const run = async (f: () => Promise<unknown>) => {
    try {
      await f();
      await refresh();
    } catch (e) {
      toast.error(problemMessage(e, i18n.language));
    }
  };
  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Users size={16} /> {t('settings.members')} {q.data && <span className="text-sm font-normal text-muted">· {q.data.organization.name}</span>}</h2>
      <ul className="divide-y divide-line">
        {q.data?.members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 py-2 text-sm">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-[11px] font-semibold">{m.name.slice(0, 2).toUpperCase()}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{m.name}</span>
              <span className="block truncate text-xs text-muted">{m.email}</span>
            </span>
            <select
              aria-label={t('members.role')}
              disabled={!isOwner || m.userId === me.data?.user.id}
              className="rounded-md border border-line bg-panel px-2 py-1 text-xs"
              value={m.role}
              onChange={(e) => void run(() => api(`/orgs/${orgId}/members/${m.userId}`, { method: 'PATCH', body: { role: e.target.value } }))}
            >
              {(['owner', 'editor', 'viewer'] as const).map((r) => <option key={r} value={r}>{t(`members.${r}`)}</option>)}
            </select>
            {isOwner && m.userId !== me.data?.user.id && (
              <button aria-label={t('members.remove')} title={t('members.remove')} className="rounded p-1 text-muted hover:text-bad" onClick={() => void run(() => api(`/orgs/${orgId}/members/${m.userId}`, { method: 'DELETE' }))}><X size={14} /></button>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api(`/orgs/${orgId}/members`, { method: 'POST', body: { email, role } });
              toast.success(t('members.added'));
              setEmail('');
            });
          }}
        >
          <Input type="email" required placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-56 flex-1" />
          <select aria-label={t('members.role')} className="rounded-md border border-line bg-panel px-2 py-1.5 text-sm" value={role} onChange={(e) => setRole(e.target.value as 'editor')}>
            {(['editor', 'viewer', 'owner'] as const).map((r) => <option key={r} value={r}>{t(`members.${r}`)}</option>)}
          </select>
          <Button variant="primary"><UserPlus size={14} /> {t('members.add')}</Button>
          <p className="w-full text-xs text-muted">{t('members.hint')}</p>
        </form>
      )}
    </Card>
  );
}
