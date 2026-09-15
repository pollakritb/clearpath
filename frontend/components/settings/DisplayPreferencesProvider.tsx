"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

interface DisplayPreferences {
  bigText: boolean;
  contrast: boolean;
}

interface DisplayPreferencesContextValue extends DisplayPreferences {
  setBigText: (enabled: boolean) => void;
  setContrast: (enabled: boolean) => void;
}

const STORAGE_KEY = "clearpath-display-preferences-v1";
const CHANGE_EVENT = "clearpath-display-preferences-change";
const DEFAULT_SNAPSHOT = JSON.stringify({ bigText: false, contrast: false });
let memorySnapshot = DEFAULT_SNAPSHOT;

const DisplayPreferencesContext =
  createContext<DisplayPreferencesContextValue | null>(null);

function getSnapshot(): string {
  try {
    memorySnapshot = window.localStorage.getItem(STORAGE_KEY) ?? memorySnapshot;
  } catch {
    // Some privacy modes block localStorage; preferences still work this session.
  }
  return memorySnapshot;
}

function subscribe(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      memorySnapshot = event.newValue ?? DEFAULT_SNAPSHOT;
      onStoreChange();
    }
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

function parseSnapshot(snapshot: string): DisplayPreferences {
  try {
    const parsed = JSON.parse(snapshot) as Partial<DisplayPreferences>;
    return {
      bigText: parsed.bigText === true,
      contrast: parsed.contrast === true,
    };
  } catch {
    return { bigText: false, contrast: false };
  }
}

export function DisplayPreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => DEFAULT_SNAPSHOT,
  );
  const preferences = useMemo(() => parseSnapshot(snapshot), [snapshot]);

  const update = useCallback((next: Partial<DisplayPreferences>) => {
    const current = parseSnapshot(getSnapshot());
    memorySnapshot = JSON.stringify({ ...current, ...next });
    try {
      window.localStorage.setItem(STORAGE_KEY, memorySnapshot);
    } catch {
      // Keep the in-memory preference when persistent storage is unavailable.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = useMemo<DisplayPreferencesContextValue>(
    () => ({
      ...preferences,
      setBigText: (enabled) => update({ bigText: enabled }),
      setContrast: (enabled) => update({ contrast: enabled }),
    }),
    [preferences, update],
  );

  return (
    <DisplayPreferencesContext.Provider value={value}>
      {children}
    </DisplayPreferencesContext.Provider>
  );
}

export function useDisplayPreferences(): DisplayPreferencesContextValue {
  const value = useContext(DisplayPreferencesContext);
  if (!value) {
    throw new Error(
      "useDisplayPreferences must be used inside DisplayPreferencesProvider",
    );
  }
  return value;
}
