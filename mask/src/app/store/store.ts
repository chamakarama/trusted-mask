import { createContext, useContext, useSyncExternalStore } from "react";
import { reducer, initialState, type Action, type AppState } from "./state";
import type { Controller } from "../controller";

export interface Store {
  getState(): AppState;
  dispatch(a: Action): void;
  subscribe(l: () => void): () => void;
}

export function createStore(init: AppState = initialState()): Store {
  let state = init;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch(a) {
      const next = reducer(state, a);
      if (next === state) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
  };
}

export const ControllerContext = createContext<Controller | null>(null);

export function useController(): Controller {
  const c = useContext(ControllerContext);
  if (!c) throw new Error("ControllerContext missing");
  return c;
}

export function useAppState(): AppState {
  const c = useController();
  return useSyncExternalStore(c.store.subscribe, c.store.getState, c.store.getState);
}
