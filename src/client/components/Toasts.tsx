import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { cn } from './ui';

type ToastKind = 'info' | 'success' | 'error';
interface Toast {
  id: number;
  text: ReactNode;
  kind: ToastKind;
}

const ToastContext = createContext<(text: ReactNode, kind?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((text: ReactNode, kind: ToastKind = 'info') => {
    const id = nextId.current++;
    setToasts((list) => [...list.slice(-3), { id, text, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 5000 : 3200);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Top of the screen, never clickable: the bottom is where cards are dragged from. */}
      <div className="pointer-events-none fixed inset-x-0 top-[68px] z-[100] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex max-w-md animate-fade-in items-center gap-2.5 rounded-xl border px-4 py-2.5 text-sm shadow-2xl shadow-black/40',
              t.kind === 'error' && 'border-bad/40 bg-[#2a1216] text-red-100',
              t.kind === 'success' && 'border-ok/40 bg-[#0f2418] text-green-100',
              t.kind === 'info' && 'border-line-2 bg-surface-3 text-fg',
            )}
          >
            {t.kind === 'error' ? (
              <CircleAlert size={16} className="shrink-0 text-bad" />
            ) : t.kind === 'success' ? (
              <CircleCheck size={16} className="shrink-0 text-ok" />
            ) : (
              <Info size={16} className="shrink-0 text-accent" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
