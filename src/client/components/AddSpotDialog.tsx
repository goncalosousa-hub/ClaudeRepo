import { useEffect, useState, type FormEvent } from 'react';
import { customAlphabet } from 'nanoid';
import { PLACE_KINDS, type PlaceType } from '../../shared/catalog';
import type { AnimeMeta } from '../../shared/types';
import { mediaNoun } from '../lib/words';
import { useRoom } from './RoomContext';
import { Button, Modal, ModalHeader, inputClass } from './ui';

const newId = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 10);

/** The kinds offered when adding by hand, most common first. */
const KINDS: Record<PlaceType, string[]> = {
  restaurant: ['restaurant', 'cafe', 'bar', 'fast_food', 'pub', 'bakery', 'ice_cream'],
  place: ['beach', 'viewpoint', 'park', 'garden', 'museum', 'castle', 'monument', 'nature_reserve', 'waterfall', 'attraction', 'town', 'village', 'other'],
};

/** A restaurant or place that is not on the map: the person writes its name and where it is. */
export function AddSpotDialog({ open, type, name, onClose }: { open: boolean; type: PlaceType; name: string; onClose: () => void }) {
  const { dispatch, openAnime } = useRoom();
  const noun = mediaNoun(type);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState(KINDS[type][0]);
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(name);
    setKind(KINDS[type][0]);
    setCity('');
    setAddress('');
  }, [open, name, type]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = title.trim();
    if (!clean) return;
    const meta: AnimeMeta = {
      key: `${type === 'restaurant' ? 'rs' : 'pl'}:x${newId()}`,
      source: 'user',
      sourceId: 0,
      idMal: null,
      title: clean.slice(0, 120),
      titleEnglish: null,
      titleNative: null,
      cover: '',
      color: null,
      banner: null,
      format: kind,
      status: null,
      episodes: null,
      year: null,
      season: null,
      genres: [],
      score: null,
      studio: null,
      synopsis: '',
      url: null,
      place: { address: address.trim().slice(0, 200) || null, city: city.trim().slice(0, 100) || null, lat: null, lon: null },
    };
    if (!dispatch({ type: 'anime.add', anime: meta })) return;
    onClose();
    // The details say it was added (a toast would stay hidden behind them).
    openAnime(meta, { added: true });
  };

  return (
    <Modal open={open} onClose={onClose} label={`Adicionar ${noun.one}`}>
      <ModalHeader title={`Adicionar ${noun.one} à mão`} subtitle="Não está no mapa? Escreve onde fica." onClose={onClose} />
      <form onSubmit={submit} className="space-y-3 px-5 py-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Nome</span>
          <input
            className={inputClass}
            value={title}
            maxLength={120}
            required
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === 'restaurant' ? 'Ex.: Tasca do Zé' : 'Ex.: Praia da Tocha'}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Tipo</span>
          <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS[type].map((k) => (
              <option key={k} value={k}>
                {PLACE_KINDS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Localidade</span>
          <input className={inputClass} value={city} maxLength={100} onChange={(e) => setCity(e.target.value)} placeholder="Ex.: Leiria" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">
            Morada <span className="font-normal text-faint">(opcional)</span>
          </span>
          <input className={inputClass} value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            Adicionar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
