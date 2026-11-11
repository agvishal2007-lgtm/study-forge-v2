import { useEffect, useRef } from 'react';
import { activeSeconds, addStudySeconds } from './studyTime';

/** How often the clock saves the active time gathered so far. */
const FLUSH_MS = 15_000;
const INTERACTIONS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;

/**
 * Runs a study clock while a study surface is on screen. It credits active study time to today's
 * record, but only while the tab is visible and the student is interacting — reading a question for
 * a while still counts, but a tab left open overnight does not. Call it once at the top of a study page.
 *
 * `courseId` attributes the time to a course when the surface belongs to one; leave it out for a
 * mixed session (for example a review across several decks), and the time still counts toward totals.
 */
export function useStudyClock(courseId?: string | null): void {
  const course = useRef(courseId);
  course.current = courseId;

  useEffect(() => {
    let prevTick = Date.now();
    let lastInteract = Date.now();
    const note = () => { lastInteract = Date.now(); };

    const credit = () => {
      const now = Date.now();
      const seconds = activeSeconds({
        fromMs: prevTick,
        toMs: now,
        visible: document.visibilityState === 'visible',
        lastInteractMs: lastInteract,
      });
      prevTick = now;
      if (seconds > 0) void addStudySeconds(seconds, course.current);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        credit();
      } else {
        // Coming back: start a fresh step so the time away isn't credited.
        prevTick = Date.now();
        lastInteract = Date.now();
      }
    };

    const timer = window.setInterval(credit, FLUSH_MS);
    for (const event of INTERACTIONS) window.addEventListener(event, note, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', credit);

    return () => {
      credit();
      window.clearInterval(timer);
      for (const event of INTERACTIONS) window.removeEventListener(event, note);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', credit);
    };
  }, []);
}
