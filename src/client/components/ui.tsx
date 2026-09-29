import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { Member } from '../../shared/types';
import { initials } from '../lib/format';

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-r from-accent to-accent-2 text-white shadow-md shadow-accent/20 hover:brightness-105 active:brightness-95',
  secondary: 'bg-surface text-fg border border-line-2 hover:bg-surface-3',
  subtle: 'bg-fg/5 text-fg hover:bg-fg/10',
  ghost: 'text-muted hover:text-fg hover:bg-fg/5',
  danger: 'bg-bad/5 text-bad border border-bad/25 hover:bg-bad/10',
};

const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-5 text-base gap-2 rounded-xl',
  icon: 'h-9 w-9 rounded-lg',
  'icon-sm': 'h-7 w-7 rounded-md',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition select-none disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

export function Avatar({
  member,
  size = 32,
  online,
  className,
  title,
}: {
  member: Pick<Member, 'name' | 'color' | 'avatar'>;
  size?: number;
  online?: boolean;
  className?: string;
  title?: string;
}) {
  const emoji = member.avatar && !/^[A-Za-z0-9]/.test(member.avatar);
  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none', className)}
      style={{
        width: size,
        height: size,
        fontSize: emoji ? size * 0.55 : size * 0.38,
        background: `color-mix(in srgb, ${member.color} 16%, var(--color-surface))`,
        boxShadow: `inset 0 0 0 2px ${member.color}`,
        color: member.color,
      }}
      title={title ?? member.name}
    >
      {emoji ? member.avatar : initials(member.name)}
      {online !== undefined && (
        <span
          className={cn(
            'absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-surface',
            online ? 'bg-ok' : 'bg-faint',
          )}
          style={{ width: Math.max(9, size * 0.3), height: Math.max(9, size * 0.3) }}
        />
      )}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  children,
  className,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="w-full overscroll-contain px-3 py-6 sm:px-6"
    >
      {open && (
        <div
          className={cn(
            'relative mx-auto w-full max-w-lg rounded-2xl border border-line-2 bg-surface shadow-2xl shadow-black/50',
            className,
          )}
        >
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ModalHeader({ title, subtitle, onClose }: { title: ReactNode; subtitle?: ReactNode; onClose?: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {onClose && (
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </Button>
      )}
    </div>
  );
}

/** A line with a word in the middle ("ou"), between two ways of doing the same thing. */
export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-faint">
      <span className="h-px flex-1 bg-line" />
      {children}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-block animate-spin rounded-full border-2 border-current border-r-transparent', className)}
      style={{ width: size, height: size }}
      aria-label="A carregar"
    />
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <div className="text-4xl">{icon}</div>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cn('inline-flex rounded-lg border border-line bg-surface-3 p-0.5', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-medium transition',
            size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm',
            value === o.value ? 'bg-surface text-fg shadow-sm shadow-black/10' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ children, className, color }: { children: ReactNode; className?: string; color?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', className)}
      style={
        color
          ? { background: `color-mix(in srgb, ${color} 16%, transparent)`, color, boxShadow: `inset 0 0 0 1px ${color}40` }
          : undefined
      }
    >
      {children}
    </span>
  );
}

export function Select({
  value,
  onChange,
  children,
  className,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'h-9 rounded-lg border border-line-2 bg-surface-2 px-2.5 text-sm text-fg outline-none hover:border-faint focus:border-accent',
        className,
      )}
    >
      {children}
    </select>
  );
}

export const inputClass =
  'h-10 w-full rounded-lg border border-line-2 bg-surface-2 px-3 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25';
