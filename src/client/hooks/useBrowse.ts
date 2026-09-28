import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnimeMeta } from '../../shared/types';
import { AnimeApiError, browseAnime, type BrowseParams, type BrowseResult } from '../lib/anime-api';

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function message(err: unknown) {
  if (err instanceof AnimeApiError) {
    if (err.status === 429) return `Demasiados pedidos à API de anime. Tenta daqui a ${err.retryAfter || 30}s.`;
    return err.message;
  }
  return 'Não foi possível carregar os animes.';
}

/** Paginated catalogue search with "load more". Stale answers are ignored. */
export function useBrowse(params: BrowseParams, enabled = true) {
  const [pages, setPages] = useState<BrowseResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const key = JSON.stringify(params);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (!enabled) return;
    const id = ++request.current;
    setPages([]);
    setError(null);
    setLoading(true);
    browseAnime(paramsRef.current, 1).then(
      (r) => {
        if (id !== request.current) return;
        setPages([r]);
        setLoading(false);
      },
      (err) => {
        if (id !== request.current) return;
        setError(message(err));
        setLoading(false);
      },
    );
  }, [key, enabled, attempt]);

  const last = pages[pages.length - 1];
  const hasMore = !!last?.hasNext;

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const id = request.current;
    setLoading(true);
    browseAnime(paramsRef.current, pages.length + 1).then(
      (r) => {
        if (id !== request.current) return;
        setPages((p) => [...p, r]);
        setLoading(false);
      },
      (err) => {
        if (id !== request.current) return;
        setError(message(err));
        setLoading(false);
      },
    );
  }, [loading, hasMore, pages.length]);

  const seen = new Set<string>();
  const items: AnimeMeta[] = [];
  for (const p of pages) for (const a of p.items) if (!seen.has(a.key)) seen.add(a.key) && items.push(a);

  return {
    items,
    loading,
    error,
    hasMore,
    total: pages[0]?.total ?? null,
    source: pages[0]?.source ?? null,
    loadMore,
    retry: () => setAttempt((n) => n + 1),
  };
}

/** Calls `onVisible` when the element scrolls into view (infinite scroll). */
export function useInView(onVisible: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && cb.current(), {
      rootMargin: '600px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return ref;
}
