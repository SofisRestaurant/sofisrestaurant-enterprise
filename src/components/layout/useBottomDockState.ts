// Public entry — Vite resolves `.ts` before `.tsx`; implementation lives in bottomDockState.tsx.
export {
  BottomDockProvider,
  useBottomDock,
  useBottomDockState,
  type BottomDockContextValue,
  type BottomDockTabId,
  type DockPhase,
} from './bottomDockState';
