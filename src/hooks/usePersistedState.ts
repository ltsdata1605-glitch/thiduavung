import { useEffect, useRef, useState, Dispatch, SetStateAction } from 'react';
import { idbGet, idbSet } from '../services/indexedDbCache';

/**
 * Like useState, but the value is mirrored to localStorage under `key` so
 * filter / sort / pagination choices survive a page refresh. Also mirrored
 * to IndexedDB (write-through) as a higher-capacity, more durable backup —
 * if localStorage came up empty for this key (cleared, quota-evicted, or a
 * fresh browser profile), the value is recovered from IndexedDB instead.
 */
export function usePersistedState<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const hadLocalStorageValueRef = useRef(true);
  const currentKeyRef = useRef(key);

  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw) as T;
    } catch (e) {
      // fall through — treated as "no local value", IndexedDB check below covers it
    }
    hadLocalStorageValueRef.current = false;
    return defaultValue;
  });

  // Re-sync when key changes (e.g. account switch)
  useEffect(() => {
    if (currentKeyRef.current !== key) {
      currentKeyRef.current = key;
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          setValue(JSON.parse(raw) as T);
          return;
        }
      } catch (e) {}
      setValue(defaultValue);
      void idbGet<T>(key).then((idbVal) => {
        if (idbVal !== undefined) setValue(idbVal);
      });
    }
  }, [key, defaultValue]);

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // localStorage quota exceeded / unavailable — IndexedDB below still gets it
    }
    void idbSet(key, value);
  }, [key, value]);

  // One-time recovery pass: if localStorage had nothing for this key at
  // mount, check IndexedDB before settling on the default.
  useEffect(() => {
    if (hadLocalStorageValueRef.current) return;
    let cancelled = false;
    (async () => {
      const idbValue = await idbGet<T>(key);
      if (!cancelled && idbValue !== undefined) setValue(idbValue);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [value, setValue];
}
