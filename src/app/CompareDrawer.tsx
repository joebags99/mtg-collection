import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CompareView } from '../features/commanders/CompareView';
import { commanderPath } from './paths';
import { useAppState } from './AppContext';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Side drawer holding the commander comparison. */
export function CompareDrawer({ open, onClose }: Props) {
  const { compareList } = useAppState();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || compareList.length < 2) return null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-surface-0/70 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-4xl bg-surface-1 border-l border-line shadow-2xl overflow-y-auto page-fade-in">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 bg-surface-1/95 backdrop-blur border-b border-line">
          <span className="text-xs uppercase tracking-[0.14em] text-ink-faint">Compare</span>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-sm">Close ✕</button>
        </div>
        <div className="px-6 py-6">
          <CompareView
            commanders={compareList}
            onBack={onClose}
            showBack={false}
            onSelectCommander={(cmd) => { onClose(); navigate(commanderPath(cmd.name), { state: { commander: cmd } }); }}
          />
        </div>
      </aside>
    </div>
  );
}
