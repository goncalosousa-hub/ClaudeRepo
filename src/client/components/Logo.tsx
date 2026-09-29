import { APP_NAME } from '../../shared/brand';
import { navigate } from '../lib/router';
import { cn } from './ui';

/** The name in two parts, the second one highlighted: "LusiHub" → Lusi|Hub, "Tierlist Live" → "Tierlist "|Live. */
function brandParts(name: string): [string, string] {
  const space = name.lastIndexOf(' ');
  if (space > 0) return [name.slice(0, space + 1), name.slice(space + 1)];
  for (let i = name.length - 1; i > 0; i--) {
    if (name[i] >= 'A' && name[i] <= 'Z') return [name.slice(0, i), name.slice(i)];
  }
  return ['', name];
}

const BRAND = brandParts(APP_NAME);

/** The Lusiaves logo, as a small rounded tile. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <img
      src="/logo.png"
      alt=""
      width={size}
      height={size}
      className="shrink-0 rounded-[22%] shadow-sm shadow-brand/30"
      style={{ width: size, height: size }}
    />
  );
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <a
      href="/"
      onClick={(e) => {
        e.preventDefault();
        navigate('/');
      }}
      className={cn('flex shrink-0 items-center gap-2.5 font-bold tracking-tight', className)}
    >
      <LogoMark size={compact ? 28 : 32} />
      {!compact && (
        <span className="text-[15px] leading-none">
          {BRAND[0]}
          <span className="text-accent">{BRAND[1]}</span>
        </span>
      )}
    </a>
  );
}
