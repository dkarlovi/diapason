import { createStore, type StoreApi } from "zustand/vanilla";

export interface PlayheadState {
  position: number | null;
  set(position: number | null): void;
}

export type PlayheadStore = StoreApi<PlayheadState>;

/** Holds the playback position outside React state so ticks don't re-render the editor. */
export function createPlayheadStore(): PlayheadStore {
  return createStore<PlayheadState>()((set) => ({
    position: null,
    set: (position) => set({ position }),
  }));
}
