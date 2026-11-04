import { Command } from 'cmdk';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface PaletteAction {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  shortcut?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: PaletteAction[] }) {
  const { t } = useTranslation();
  if (!open) return null;
  const groups = [...new Set(actions.map((a) => a.group))];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[14vh] backdrop-blur-sm" onMouseDown={onClose}>
      <Command
        label={t('palette.title')}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <Command.Input autoFocus placeholder={t('palette.placeholder')} className="w-full border-b border-line bg-transparent px-4 py-3 text-sm outline-none" />
        <Command.List className="max-h-[50vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{t('palette.empty')}</Command.Empty>
          {groups.map((g) => (
            <Command.Group key={g} heading={g} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted">
              {actions
                .filter((a) => a.group === g)
                .map((a) => (
                  <Command.Item
                    key={a.id}
                    value={`${a.group} ${a.label}`}
                    onSelect={() => {
                      onClose();
                      a.run();
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent/10 data-[selected=true]:text-accent"
                  >
                    <span className="text-muted">{a.icon}</span>
                    <span className="flex-1">{a.label}</span>
                    {a.shortcut && <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">{a.shortcut}</kbd>}
                  </Command.Item>
                ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
