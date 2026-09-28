import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { nanoid } from 'nanoid';
import { LIMITS, TIER_COLORS, TIER_PRESETS } from '../../shared/constants';
import type { Tier } from '../../shared/types';
import { readableOn } from '../lib/format';
import { useRoom } from './RoomContext';
import { Button, Modal, ModalHeader, Select, cn } from './ui';

export function TierEditorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { room, dispatch, noun } = useRoom();
  const [tiers, setTiers] = useState<Tier[]>(room.tiers);
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTiers(room.tiers.map((t) => ({ ...t })));
      setPicking(null);
    }
    // Only reset when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (id: string, patch: Partial<Tier>) => setTiers((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const move = (i: number, d: number) =>
    setTiers((list) => {
      const next = [...list];
      const [t] = next.splice(i, 1);
      next.splice(i + d, 0, t);
      return next;
    });

  const used = (id: string) => Object.values(room.boards).some((b) => (b[id]?.length ?? 0) > 0);
  const valid = tiers.length > 0 && tiers.every((t) => t.label.trim());

  const save = () => {
    const removed = room.tiers.filter((t) => !tiers.some((x) => x.id === t.id) && used(t.id));
    if (
      removed.length &&
      !confirm(
        `${noun.f ? 'As' : 'Os'} ${noun.many} em ${removed.map((t) => t.label).join(', ')} voltam para «Por classificar» em todas as tierlists. Continuar?`,
      )
    )
      return;
    if (dispatch({ type: 'tiers.set', tiers: tiers.map((t) => ({ ...t, label: t.label.trim() })) })) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} label="Editar tiers">
      <ModalHeader title="Editar tiers" subtitle="Os tiers são os mesmos para todas as tierlists da sala." onClose={onClose} />
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Modelos:</span>
          <Select
            label="Modelo de tiers"
            value=""
            onChange={(v) => {
              const preset = TIER_PRESETS.find((p) => p.name === v);
              if (!preset) return;
              // Keep ids of tiers in the same position so placements survive where possible.
              setTiers(preset.tiers.map((t, i) => ({ ...t, id: tiers[i]?.id ?? t.id })));
            }}
          >
            <option value="">Escolher um modelo…</option>
            {TIER_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>

        <ul className="space-y-2">
          {tiers.map((t, i) => (
            <li key={t.id} className="rounded-xl border border-line bg-surface-2 p-2">
              <div className="flex items-center gap-2">
                <button
                  className="flex h-10 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                  style={{ background: t.color, color: readableOn(t.color) }}
                  onClick={() => setPicking(picking === t.id ? null : t.id)}
                  aria-label="Mudar a cor"
                  title="Mudar a cor"
                >
                  {t.label.slice(0, 3) || '?'}
                </button>
                <input
                  value={t.label}
                  maxLength={LIMITS.tierLabel}
                  onChange={(e) => update(t.id, { label: e.target.value })}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-line-2 bg-surface px-3 text-sm outline-none focus:border-accent"
                  aria-label="Nome do tier"
                />
                <Button size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
                  <ArrowUp size={15} />
                </Button>
                <Button size="icon-sm" variant="ghost" disabled={i === tiers.length - 1} onClick={() => move(i, 1)} aria-label="Descer">
                  <ArrowDown size={15} />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={tiers.length <= 1}
                  onClick={() => setTiers((list) => list.filter((x) => x.id !== t.id))}
                  aria-label="Apagar tier"
                >
                  <Trash2 size={15} />
                </Button>
              </div>
              {picking === t.id && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-1">
                  {TIER_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => update(t.id, { color: c })}
                      className={cn('h-7 w-7 rounded-md', t.color === c && 'ring-2 ring-white')}
                      style={{ background: c }}
                      aria-label={`Cor ${c}`}
                    />
                  ))}
                  <input
                    type="color"
                    value={t.color}
                    onChange={(e) => update(t.id, { color: e.target.value })}
                    className="h-7 w-9 cursor-pointer rounded-md border border-line-2 bg-transparent"
                    aria-label="Outra cor"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>

        <Button
          size="sm"
          variant="subtle"
          disabled={tiers.length >= LIMITS.maxTiers}
          onClick={() =>
            setTiers((list) => [
              ...list,
              { id: nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, 'x'), label: 'Novo', color: TIER_COLORS[list.length % TIER_COLORS.length] },
            ])
          }
        >
          <Plus size={14} /> Adicionar tier
        </Button>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" disabled={!valid} onClick={save}>
          Guardar tiers
        </Button>
      </div>
    </Modal>
  );
}
