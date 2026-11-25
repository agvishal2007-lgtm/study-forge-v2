import { useEffect, useMemo, useRef } from 'react';

/** The address the student is at right now, without anything after a `?`. */
const where = () => (typeof window === 'undefined' ? '' : window.location.hash.split('?')[0]);

/**
 * After slow work, tells a screen whether the student is still on it, before moving them anywhere.
 *
 * Being mounted is not enough on its own. A screen that deletes something and then moves the
 * student on has to wait for the database, and in that gap the student may well have tapped
 * somewhere else. React has not necessarily unmounted this screen yet when the database answers —
 * on a slow phone the answer often arrives first — so a check for mounting alone passes, and the
 * screen drags the student back from wherever they just went.
 *
 * That is why this also asks the browser where it actually is. `window.location` is the live truth
 * and cannot be a step behind the way React's own state can. A tap that has changed the address
 * means the student has left, mounted or not, and nothing should override that.
 *
 * Found by a test that deletes a file and leaves in the same instant. It passed on a fast machine
 * for months and failed on a slower one, which is the machine most students are actually using.
 */
export function useStillHere(): { readonly current: boolean } {
  const mounted = useRef(true);
  const address = useRef(where());
  useEffect(() => {
    mounted.current = true;
    address.current = where();
    return () => {
      mounted.current = false;
    };
  }, []);
  return useMemo(() => ({
    get current() {
      return mounted.current && where() === address.current;
    },
  }), []);
}
