import { APP_NAME } from '../../shared/brand';
import { navigate } from '../lib/router';
import { cn } from './ui';

/** The name in two parts, the second one highlighted: "LusiMovies" → Lusi|Movies, "Tierlist Live" → "Tierlist "|Live. */
function brandParts(name: string): [string, string] {
  const space = name.lastIndexOf(' ');
  if (space > 0) return [name.slice(0, space + 1), name.slice(space + 1)];
  for (let i = name.length - 1; i > 0; i--) {
    if (name[i] >= 'A' && name[i] <= 'Z') return [name.slice(0, i), name.slice(i)];
  }
  return ['', name];
}

const BRAND = brandParts(APP_NAME);

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#logo-g)" />
      <rect x="12" y="13" width="10" height="10" rx="2.5" fill="#fff" />
      <rect x="26" y="13" width="26" height="10" rx="2.5" fill="#fff" opacity=".9" />
      <rect x="12" y="27" width="10" height="10" rx="2.5" fill="#fff" opacity=".85" />
      <rect x="26" y="27" width="18" height="10" rx="2.5" fill="#fff" opacity=".7" />
      <rect x="12" y="41" width="10" height="10" rx="2.5" fill="#fff" opacity=".7" />
      <rect x="26" y="41" width="10" height="10" rx="2.5" fill="#fff" opacity=".5" />
    </svg>
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
          <span className="text-gradient">{BRAND[1]}</span>
        </span>
      )}
    </a>
  );
}
