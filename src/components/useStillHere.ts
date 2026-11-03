import { useEffect, useRef } from 'react';

/** After slow work, tells a screen whether the student is still on it, before moving them anywhere. */
export function useStillHere() {
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);
  return here;
}
