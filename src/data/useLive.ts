import { useEffect, useState } from 'react';
import { subscribe } from './db';

export interface Live<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
}

/** Loads saved data, then reloads it whenever saved data changes. */
export function useLive<T>(load: () => Promise<T>, deps: unknown[] = []): Live<T> {
  const [state, setState] = useState<Live<T>>({ data: undefined, error: null, loading: true });
  useEffect(() => {
    let active = true;
    const run = () =>
      load().then(
        (data) => active && setState({ data, error: null, loading: false }),
        (error: Error) => active && setState({ data: undefined, error, loading: false }),
      );
    setState((previous) => ({ ...previous, loading: true }));
    run();
    const unsubscribe = subscribe(run);
    return () => {
      active = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
