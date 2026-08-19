import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type Film } from "@/lib/catalog";

export type Progress = {
  slug: string;
  seconds: number;
  duration: number;
  updatedAt: number;
};

type LibraryState = {
  list: string[];
  progress: Record<string, Progress>;
  added: Record<string, Film>;
  generatedSubs: Record<string, boolean>;
  toggleList: (slug: string) => void;
  inList: (slug: string) => boolean;
  addFilm: (film: Film) => void;
  removeAdded: (slug: string) => void;
  saveProgress: (entry: Omit<Progress, "updatedAt">) => void;
  clearProgress: (slug: string) => void;
  markGenerated: (slug: string) => void;
  continueWatching: () => Progress[];
};

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      list: [],
      progress: {},
      added: {},
      generatedSubs: {},
      toggleList: (slug) =>
        set((s) => ({
          list: s.list.includes(slug) ? s.list.filter((id) => id !== slug) : [slug, ...s.list],
        })),
      inList: (slug) => get().list.includes(slug),
      addFilm: (film) =>
        set((s) => {
          const added = { ...s.added, [film.id]: film };
          const ids = Object.keys(added);
          if (ids.length > 80) {
            for (const id of ids.slice(0, ids.length - 80)) delete added[id];
          }
          const list = s.list.includes(film.id) ? s.list : [film.id, ...s.list];
          return { added, list };
        }),
      removeAdded: (slug) =>
        set((s) => {
          const added = { ...s.added };
          delete added[slug];
          return { added };
        }),
      saveProgress: (entry) => {
        if (!Number.isFinite(entry.seconds) || entry.seconds < 3) return;
        if (entry.duration > 0 && entry.seconds / entry.duration > 0.96) {
          set((s) => {
            const next = { ...s.progress };
            delete next[entry.slug];
            return { progress: next };
          });
          return;
        }
        set((s) => ({
          progress: {
            ...s.progress,
            [entry.slug]: { ...entry, updatedAt: Date.now() },
          },
        }));
      },
      clearProgress: (slug) =>
        set((s) => {
          const next = { ...s.progress };
          delete next[slug];
          return { progress: next };
        }),
      markGenerated: (slug) =>
        set((s) => ({
          generatedSubs: { ...s.generatedSubs, [slug]: true },
        })),
      continueWatching: () =>
        Object.values(get().progress)
          .filter((p) => p.duration > 0 && p.seconds / p.duration < 0.95 && p.seconds > 8)
          .sort((a, b) => b.updatedAt - a.updatedAt),
    }),
    {
      name: "linterna-library",
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<LibraryState>;
        return {
          ...current,
          ...p,
          list: p.list ?? current.list,
          progress: p.progress ?? current.progress,
          added: p.added ?? current.added,
          generatedSubs: p.generatedSubs ?? current.generatedSubs,
        };
      },
    },
  ),
);
