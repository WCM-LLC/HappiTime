import { useEffect, useReducer } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "happitime:visit_reminders_enabled";

// Module-level shared store: AsyncStorage writes don't notify other hook
// instances, so the Settings toggle and App.tsx's tracking effect must read
// the same in-memory state and re-render together.
let _enabled = false;
let _loaded = false;
let _loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => {
  listeners.forEach((l) => l());
};

const ensureLoaded = () => {
  if (_loaded || _loading) return;
  _loading = AsyncStorage.getItem(STORAGE_KEY)
    .then((v) => {
      _enabled = v === "true";
    })
    .catch(() => {
      _enabled = false;
    })
    .finally(() => {
      _loaded = true;
      _loading = null;
      emit();
    });
};

export async function setVisitReminderConsent(value: boolean): Promise<void> {
  _enabled = value;
  _loaded = true;
  emit();
  try {
    await AsyncStorage.setItem(STORAGE_KEY, value ? "true" : "false");
  } catch {
    // Best-effort persistence; in-memory state already reflects the choice.
  }
}

export function useVisitReminderConsent() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    listeners.add(force);
    ensureLoaded();
    return () => {
      listeners.delete(force);
    };
  }, []);
  return { enabled: _enabled, loading: !_loaded, setEnabled: setVisitReminderConsent };
}
