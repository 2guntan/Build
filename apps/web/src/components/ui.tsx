import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({ variant = 'default', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' | 'danger' }) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed',
        variant === 'primary' && 'bg-accent text-accent-ink hover:brightness-110',
        variant === 'default' && 'border border-line bg-panel hover:bg-surface',
        variant === 'ghost' && 'hover:bg-surface',
        variant === 'danger' && 'bg-bad text-white hover:brightness-110',
        className,
      )}
    />
  );
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx('w-full rounded-md border border-line bg-panel px-2.5 py-1.5 text-sm outline-none focus:border-accent', className)} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-lg border border-line bg-panel', className)}>{children}</div>;
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'accent'; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-surface text-muted',
        tone === 'ok' && 'bg-ok/10 text-ok',
        tone === 'warn' && 'bg-warn/10 text-warn',
        tone === 'bad' && 'bg-bad/10 text-bad',
        tone === 'accent' && 'bg-accent/10 text-accent',
      )}
    >
      {children}
    </span>
  );
}

export function Tabs<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex border-b border-line">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx('flex-1 px-3 py-2 text-sm font-medium', value === it.id ? 'border-b-2 border-accent text-ink' : 'text-muted hover:text-ink')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-base font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function TestBanner({ text }: { text: string }) {
  return (
    <div role="alert" className="bg-bad px-4 py-1.5 text-center text-xs font-semibold text-white">
      {text}
    </div>
  );
}

export function IconButton({ label, active, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...p}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-8 w-8 items-center justify-center rounded-md border border-line bg-panel/95 text-ink shadow-sm backdrop-blur transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40',
        active && 'border-accent text-accent',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Segmented({ items, value, onChange, label }: { items: { id: string; label: ReactNode; title?: string }[]; value: string | null; onChange: (id: string) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex overflow-hidden rounded-md border border-line bg-panel/95 text-xs shadow-sm backdrop-blur">
      {items.map((it) => (
        <button
          key={it.id}
          title={it.title}
          aria-pressed={value === it.id}
          onClick={() => onChange(it.id)}
          className={cx('flex h-8 min-w-8 items-center justify-center px-2.5 font-medium transition', value === it.id ? 'bg-accent text-accent-ink' : 'hover:bg-surface')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-md bg-line/70', className)} />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}
