import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { getDb, subscribe } from '../../data/db';
import { TOUR_STEPS } from './steps';

const STATE_KEY = 'walkthrough';
const FIND_TARGET_MS = 1500;
const CARD_GAP = 12;
const CARD_WIDTH = 380;
const CARD_MIN_SIDE_WIDTH = 240;

interface SavedTour {
  status: 'active' | 'paused' | 'finished';
  step: number;
}

async function loadTour(): Promise<SavedTour | null> {
  const value = (await (await getDb()).get('meta', STATE_KEY)) as SavedTour | undefined;
  return value && typeof value.step === 'number' ? value : null;
}

// Forgetting a place is harmless, so a failed save never interrupts the walkthrough.
const saveTour = (tour: SavedTour) => getDb().then((db) => db.put('meta', tour, STATE_KEY)).catch(() => undefined);

const WalkthroughContext = createContext<{ start: () => void } | null>(null);

export function useWalkthrough() {
  const value = useContext(WalkthroughContext);
  if (!value) throw new Error('useWalkthrough must be used inside WalkthroughProvider');
  return value;
}

function findTarget(selectors: string[] | undefined): Element | null {
  for (const selector of selectors ?? []) {
    const element = document.querySelector(selector);
    if (element && element.getClientRects().length > 0) return element;
  }
  return null;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
  /** Corner rounding that follows the shape of the part, so a round button gets a round ring. */
  radius: number;
}

const isClear = (color: string) => color === 'transparent' || /rgba\(.*,\s*0\)$/.test(color);

/** Whether an element draws its own outline: a button, a field, or a card with a background or border. */
function drawsItsOwnBox(element: Element): boolean {
  if (element.matches('button, a, input, select, textarea, label.search, [role=radiogroup], fieldset, li')) return true;
  const style = getComputedStyle(element);
  return !isClear(style.backgroundColor) || parseFloat(style.borderTopWidth) > 0 || style.boxShadow !== 'none';
}

/**
 * The area the part really takes up. A wrapper that only lines things up (a full-width row with
 * one button in it, say) is shrunk to what's inside, so the ring fits the button, not the row.
 */
function fittedRect(element: Element, depth = 0): { rect: DOMRect; radius: number } {
  const own = element.getBoundingClientRect();
  const ownRadius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
  if (drawsItsOwnBox(element) || depth > 3) return { rect: own, radius: ownRadius };
  const parts = [...element.children].filter((child) => child.getClientRects().length > 0 && getComputedStyle(child).visibility !== 'hidden');
  const fitted = parts.map((child) => fittedRect(child, depth + 1));
  // Words take up only their own width, even in a heading that stretches across the page.
  for (const node of element.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) fitted.push({ rect, radius: 8 });
  }
  if (fitted.length === 0) return { rect: own, radius: ownRadius };
  const left = Math.min(...fitted.map((item) => item.rect.left));
  const top = Math.min(...fitted.map((item) => item.rect.top));
  const right = Math.max(...fitted.map((item) => item.rect.right));
  const bottom = Math.max(...fitted.map((item) => item.rect.bottom));
  return { rect: new DOMRect(left, top, right - left, bottom - top), radius: fitted.length === 1 ? fitted[0].radius : 12 };
}

/** The ring around the part: a small, even margin, the part's own shape, kept on screen. */
function visibleBox(element: Element): Box {
  const { rect, radius } = fittedRect(element);
  // Small controls get a close ring; bigger areas get more room, so nothing inside touches the ring.
  // On a phone held sideways space is tight, so big areas keep the smaller margin there.
  const pad = Math.min(rect.width, rect.height) <= 64 || window.innerHeight < 480 ? 8 : 14;
  let top = rect.top - pad;
  let left = rect.left - pad;
  let right = rect.right + pad;
  let bottom = rect.bottom + pad;
  const panel = element.closest('main');
  if (panel) {
    const limit = panel.getBoundingClientRect();
    top = Math.max(top, limit.top);
    left = Math.max(left, limit.left);
    right = Math.min(right, limit.right);
    bottom = Math.min(bottom, limit.bottom);
  }
  top = Math.max(top, 3);
  left = Math.max(left, 3);
  right = Math.min(right, window.innerWidth - 3);
  bottom = Math.min(bottom, window.innerHeight - 3);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return { top, left, width, height, radius: Math.min(radius + pad, height / 2, width / 2) };
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height && a.radius === b.radius);

interface CardPlace { top: number; left: number; width: number }

/**
 * Puts the explanation right beside the part when there's room: below or above a wide part,
 * to the right or left of a narrow one, narrowing the card a little if that makes it fit. Only
 * when nothing fits does it cover the part, and then on whichever edge hides the least of it.
 * `heightAt` measures the card at a given width, since narrower cards are taller.
 */
function placeCard(box: Box | null, heightAt: (width: number) => number): CardPlace {
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const margin = 12;
  const full = Math.min(CARD_WIDTH, screenW - margin * 2);
  const clampLeft = (value: number, width: number) => Math.min(Math.max(margin, value), screenW - width - margin);
  const clampTop = (value: number, height: number) => Math.min(Math.max(margin, value), screenH - height - margin);
  const fullHeight = heightAt(full);
  if (!box) return { top: clampTop((screenH - fullHeight) / 2, fullHeight), left: clampLeft((screenW - full) / 2, full), width: full };

  const below = () => {
    const room = screenH - (box.top + box.height) - CARD_GAP - margin;
    return room >= fullHeight ? { top: box.top + box.height + CARD_GAP, left: clampLeft(box.left, full), width: full } : null;
  };
  const above = () => {
    const room = box.top - CARD_GAP - margin;
    return room >= fullHeight ? { top: box.top - fullHeight - CARD_GAP, left: clampLeft(box.left, full), width: full } : null;
  };
  const side = (where: 'right' | 'left') => {
    const room = where === 'right' ? screenW - (box.left + box.width) - CARD_GAP - margin : box.left - CARD_GAP - margin;
    if (room < CARD_MIN_SIDE_WIDTH) return null;
    const width = Math.min(full, room);
    const height = heightAt(width);
    if (height > screenH - margin * 2) return null;
    const left = where === 'right' ? box.left + box.width + CARD_GAP : box.left - CARD_GAP - width;
    // Lined up with the top of the part, or with its middle when the part is small.
    const top = clampTop(box.height < height ? box.top + box.height / 2 - height / 2 : box.top, height);
    return { top, left, width };
  };
  const wide = box.width > screenW * 0.5;
  const order = wide ? [below, above, () => side('right'), () => side('left')] : [() => side('right'), below, above, () => side('left')];
  for (const attempt of order) {
    const place = attempt();
    if (place) return place;
  }
  // Nothing fits beside it, so the card sits along the top or bottom edge, whichever covers less.
  const atBottom = screenH - fullHeight - margin;
  const coveredBottom = Math.max(0, box.top + box.height - atBottom);
  const coveredTop = Math.max(0, margin + fullHeight - box.top);
  const top = coveredTop < coveredBottom ? margin : atBottom;
  return { top, left: clampLeft(box.left + (box.width - full) / 2, full), width: full };
}

function Overlay({ step, onStep, onPause, onFinish, onRestart }: {
  step: number;
  onStep: (next: number) => void;
  onPause: () => void;
  onFinish: () => void;
  onRestart: () => void;
}) {
  const definition = TOUR_STEPS[step];
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const card = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  // The box belongs to the step it was measured for, so the last step's box never shows on this one.
  const [measured, setMeasured] = useState<{ step: number; box: Box } | null>(null);
  const box = measured && measured.step === step ? measured.box : null;
  const setBox = useCallback((next: Box | null) => setMeasured(next ? { step, box: next } : null), [step]);
  const [notFound, setNotFound] = useState(false);
  const [cardPosition, setCardPosition] = useState<(CardPlace & { height: number }) | null>(null);

  // Whether the action this step asks for is done yet. Null means still checking.
  const [actionDone, setActionDone] = useState<boolean | null>(definition.action ? null : true);
  useEffect(() => {
    const action = definition.action;
    if (!action) {
      setActionDone(true);
      return;
    }
    let active = true;
    setActionDone(null);
    const check = () => action.isDone().then((done) => { if (active) setActionDone(done); }, () => { if (active) setActionDone(true); });
    void check();
    const unsubscribe = subscribe(() => void check());
    return () => {
      active = false;
      unsubscribe();
    };
  }, [definition]);

  // Next waits until a hands-on step is done.
  const trying = !!definition.action && actionDone === false;
  // The highlighted part of a hands-on step can always be used, even when it's already done (a
  // student who has courses can still add another), so it never looks usable while it's locked.
  const handsOn = !!definition.action;

  // Extra room under the page while the tour runs, so on a short screen even a part near the end
  // of a short page can scroll up and leave space for the explanation below it.
  useEffect(() => {
    document.body.classList.add('tour-active');
    return () => document.body.classList.remove('tour-active');
  }, []);

  // Otherwise the rest of the app can't be clicked, tabbed to, or read out while this is open.
  useEffect(() => {
    const root = document.getElementById('root');
    if (handsOn) root?.removeAttribute('inert');
    else root?.setAttribute('inert', '');
    return () => root?.removeAttribute('inert');
  }, [handsOn]);

  const trackedElement = useRef<Element | null>(null);
  // On a step that's only for looking, a tap on the highlighted part explains why nothing happened.
  const [lookOnly, setLookOnly] = useState(false);
  useEffect(() => { setLookOnly(false); }, [step]);

  useEffect(() => {
    if (definition.route && definition.route !== pathname) navigate(definition.route);
    // Only moves when the step changes, so nothing fights with the screen once it's there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Finds the part on screen, scrolls to it, and keeps the box on it as things move.
  useEffect(() => {
    setNotFound(false);
    setBox(null);
    if (!definition.target) return;
    let frame = 0;
    let scrolledTo: Element | null = null;
    let last: Box | null = null;
    const started = performance.now();
    const tick = () => {
      // A fresh visit has no address after the #, which means the home screen.
      const path = window.location.hash.replace(/^#/, '').split('?')[0] || '/';
      const routeOk = !definition.route || path === definition.route;
      // An action can lead to another screen, such as a new note, so the box follows it there.
      const followed = definition.action?.follow?.find((item) => item.match.test(path));
      const element = followed ? findTarget(followed.target) : routeOk ? findTarget(definition.target) : null;
      trackedElement.current = element;
      if (element) {
        if (scrolledTo !== element) {
          scrolledTo = element;
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          // A tall section starts at its top, and anything smaller is centered.
          const panel = element.closest('main');
          const tall = panel && element.getBoundingClientRect().height > panel.clientHeight * 0.8;
          // On a short screen, such as a phone on its side, the part goes near the top so the
          // explanation has room under it instead of covering it.
          const short = window.innerHeight < 720;
          element.scrollIntoView({ block: tall || short ? 'start' : 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
          // Once the scroll has settled, make sure the bottom of the part (where its buttons usually
          // are) isn't hidden under the bottom bar. Done once, so it never fights the student's scrolling.
          const settleFor = element;
          window.setTimeout(() => {
            if (trackedElement.current !== settleFor || !panel) return;
            const part = settleFor.getBoundingClientRect();
            const area = panel.getBoundingClientRect();
            const overflow = part.bottom + 18 - area.bottom;
            // Not on a phone held sideways, where the explanation sits beside the part instead.
            if (overflow > 0 && window.innerWidth <= window.innerHeight && part.height + 36 < area.height) panel.scrollBy({ top: overflow, behavior: reduce ? 'auto' : 'smooth' });
          }, reduce ? 50 : 500);
        }
        const next = visibleBox(element);
        if (!sameBox(last, next)) {
          last = next;
          setBox(next);
          setNotFound(false);
        }
      } else if (performance.now() - started > FIND_TARGET_MS) {
        if (last !== null || !notFoundRef.current) {
          last = null;
          setBox(null);
          setNotFound(true);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const notFoundRef = useRef(false);
  notFoundRef.current = notFound;

  useLayoutEffect(() => {
    const measure = () => {
      const element = card.current;
      if (!element) return;
      const before = element.style.width;
      const heightAt = (width: number) => {
        element.style.width = `${width}px`;
        return element.offsetHeight;
      };
      const spot = placeCard(box, heightAt);
      const place = { ...spot, height: heightAt(spot.width) };
      element.style.width = before;
      setCardPosition((now) => (now && now.top === place.top && now.left === place.left && now.width === place.width && now.height === place.height ? now : place));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [box, step, notFound, actionDone, trying]);

  // On a screen too small for both, a tall part's ring shows only the part that the explanation
  // leaves uncovered (its heading and first controls), instead of a ring hidden under the card.
  const ring = (() => {
    if (!box || !cardPosition) return box;
    const c = cardPosition;
    const sideBySide = c.left >= box.left + box.width || c.left + c.width <= box.left;
    if (sideBySide) return box;
    const cardBottom = c.top + c.height;
    if (c.top > box.top + 48 && c.top < box.top + box.height) return { ...box, height: c.top - 8 - box.top };
    if (cardBottom < box.top + box.height - 48 && cardBottom > box.top) return { ...box, top: cardBottom + 8, height: box.top + box.height - cardBottom - 8 };
    return box;
  })();

  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;
  const percent = Math.round((step / TOUR_STEPS.length) * 100);
  const waiting = !!definition.target && !box && !notFound && actionDone !== true;
  // If the part to try isn't on screen, it can't be done, so nobody gets stuck here.
  const nextLocked = (trying && !notFound) || actionDone === null;

  // The Next button is briefly disabled while a section is found, so focus waits until it's ready.
  useEffect(() => {
    // While trying something, focus waits on the card, so a phone's keyboard doesn't jump up.
    if (nextLocked) card.current?.focus({ preventScroll: true });
    else if (!waiting) primary.current?.focus({ preventScroll: true });
  }, [step, waiting, nextLocked]);

  const actionFinishedRef = useRef(true);
  actionFinishedRef.current = !handsOn;

  // Keys work even if focus has landed nowhere, and Tab can't leave the walkthrough.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onPause();
      } else if (event.key === 'Tab') {
        const inTarget = trackedElement.current && !actionFinishedRef.current
          ? [...trackedElement.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]
          : [];
        const items = [...inTarget, ...(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!items.includes(active as HTMLElement) && active !== card.current) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onPause]);

  /*
   * A tap meant for the highlighted part can land on the dimmed area for a moment, for example
   * while a phone's keyboard closes and the page moves. When the tap is really on the highlighted
   * part, it's passed through, so one tap is always enough. Taps anywhere else are still caught.
   */
  const passThrough = (event: React.MouseEvent) => {
    const element = trackedElement.current;
    if (!element || !handsOn) return;
    const { clientX: x, clientY: y } = event;
    const rect = element.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
    const walls = [...document.querySelectorAll<HTMLElement>('.tour-blocker')];
    walls.forEach((wall) => { wall.style.pointerEvents = 'none'; });
    const below = document.elementFromPoint(x, y);
    walls.forEach((wall) => { wall.style.pointerEvents = ''; });
    if (!below || !element.contains(below)) return;
    const control = below.closest<HTMLElement>('button, a[href], input, select, textarea, summary, label, [role=button], [role=menuitem]');
    if (!control || !element.contains(control) || (control as HTMLButtonElement).disabled) return;
    control.focus();
    if (!control.matches('input:not([type=checkbox]):not([type=radio]), select, textarea')) control.click();
  };

  return createPortal(
    <div className="tour">
      {/* Catches every click outside the explanation. */}
      {handsOn && ring ? (
        // Four walls around the box, so only the highlighted part can be used.
        <>
          <div className="tour-blocker" data-testid="tour-blocker" onClick={passThrough} style={{ bottom: `calc(100% - ${ring.top}px)` }} />
          <div className="tour-blocker" onClick={passThrough} style={{ top: ring.top + ring.height }} />
          <div className="tour-blocker" onClick={passThrough} style={{ top: ring.top, height: ring.height, right: `calc(100% - ${ring.left}px)` }} />
          <div className="tour-blocker" onClick={passThrough} style={{ top: ring.top, height: ring.height, left: ring.left + ring.width }} />
        </>
      ) : (
        <div className="tour-blocker" data-testid="tour-blocker" onClick={(event) => {
          if (!ring) return;
          const { clientX: x, clientY: y } = event;
          if (x >= ring.left && x <= ring.left + ring.width && y >= ring.top && y <= ring.top + ring.height) setLookOnly(true);
        }} />
      )}
      {ring && !(definition.action && actionDone === true && !findTarget(definition.target))
        ? <div className="tour-box" data-testid="tour-box" style={{ top: ring.top, left: ring.left, width: ring.width, height: ring.height, borderRadius: Math.min(ring.radius, ring.height / 2) }} />
        : <div className="tour-dark" />}
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        tabIndex={-1}
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        data-testid="tour-card"
        data-step={definition.id}
        data-action-pending={nextLocked}
        data-trying={trying && !notFound}
        data-hands-on={handsOn && !notFound}
        style={cardPosition ? { top: cardPosition.top, left: cardPosition.left, width: cardPosition.width } : { visibility: 'hidden', top: 0, left: 0 }}
      >
        <button className="tour-close" aria-label="Close walkthrough" title="Close walkthrough" onClick={onPause}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <p className="tour-count" data-testid="tour-count">Step {step + 1} of {TOUR_STEPS.length}, {percent}% complete</p>
        <div className="meter" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Walkthrough progress">
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="tour-scroll">
        <h2 id="tour-title" aria-live="polite">{definition.title}</h2>
        <p id="tour-body">{definition.body}</p>
        {trying && !notFound && <p className="tour-try" data-testid="tour-try">{definition.action?.instruction}</p>}
        {definition.action && actionDone === true && <p className="tour-done" data-testid="tour-done" role="status">{definition.action.doneMessage}</p>}
        {lookOnly && !handsOn && <p className="tour-look" data-testid="tour-look" role="status">This step is just for looking. Press Next to keep going; you can use it once the tour is over.</p>}
        {notFound && !(definition.action && actionDone === true) && <p className="muted" data-testid="tour-missing">This part isn't on the screen right now, so there's nothing to highlight. You can keep going.</p>}
        </div>
        <div className="tour-actions">
          {isLast
            ? <button ref={primary} className="button primary" onClick={onFinish}>Finish</button>
            : <button ref={primary} className="button primary" disabled={waiting || nextLocked} onClick={() => onStep(step + 1)}>{isFirst ? 'Start' : 'Next'}</button>}
          {!isFirst && <button className="button" onClick={() => onStep(step - 1)}>Back</button>}
          {!isFirst && !isLast && <button className="text-button" onClick={onRestart}>Start over</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function WalkthroughProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<number | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const savedRef = useRef<SavedTour | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback((at: number) => {
    const clamped = Math.min(Math.max(0, at), TOUR_STEPS.length - 1);
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    savedRef.current = { status: 'active', step: clamped };
    void saveTour(savedRef.current);
    setStep(clamped);
  }, []);

  // It never opens by itself. Students start it when they want to, and it remembers their place.
  const placeLoaded = useRef<Promise<void> | null>(null);
  useEffect(() => {
    placeLoaded.current = loadTour().then((saved) => { savedRef.current = saved; }).catch(() => undefined);
  }, []);

  const begin = useCallback(() => {
    // A tap right after the page opens waits for the saved place, so it can't be overwritten with step 1.
    void (placeLoaded.current ?? Promise.resolve()).then(() => {
      const saved = savedRef.current;
      open(saved && saved.status !== 'finished' ? saved.step : 0);
    });
  }, [open]);

  const start = useCallback(() => {
    // Moving between screens would lose unsaved work in the lesson editor, so ask first.
    if (pathRef.current.endsWith('/edit')) setConfirmLeave(true);
    else begin();
  }, [begin]);

  const close = useCallback((status: SavedTour['status'], at: number) => {
    savedRef.current = { status, step: at };
    void saveTour(savedRef.current);
    setStep(null);
    returnFocus.current?.focus?.({ preventScroll: true });
  }, []);

  const value = useMemo(() => ({ start }), [start]);
  return (
    <WalkthroughContext.Provider value={value}>
      {children}
      {step !== null && (
        <Overlay
          step={step}
          onStep={(next) => {
            savedRef.current = { status: 'active', step: next };
            void saveTour(savedRef.current);
            setStep(next);
          }}
          onPause={() => close('paused', step)}
          onFinish={() => close('finished', 0)}
          onRestart={() => {
            savedRef.current = { status: 'active', step: 0 };
            void saveTour(savedRef.current);
            setStep(0);
          }}
        />
      )}
      {confirmLeave && (
        <ConfirmDialog
          title="Leave this checkpoint?"
          confirmLabel="Leave and start walkthrough"
          onCancel={() => setConfirmLeave(false)}
          onConfirm={() => {
            setConfirmLeave(false);
            begin();
          }}
        >
          <p>The walkthrough moves between screens, so any unsaved changes to this checkpoint will be lost. Save it first if you want to keep them.</p>
        </ConfirmDialog>
      )}
    </WalkthroughContext.Provider>
  );
}

/**
 * The ? button: help in two depths. The walkthrough is the quick guided tour; Study Forge Academy
 * is the in-depth guide to every feature.
 */
export function WalkthroughButton() {
  const { start } = useWalkthrough();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    wrap.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);
  const choose = (action: () => void) => { setOpen(false); action(); };
  return (
    <div className="help-menu-wrap" ref={wrap}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); button.current?.focus(); }
        if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && open) {
          event.preventDefault();
          const items = [...(wrap.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
          const at = items.indexOf(document.activeElement as HTMLElement);
          items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
        }
      }}>
      <button ref={button} className="icon-button" aria-label="Help" title="Help: walkthrough or Academy" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((now) => !now)}>
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.2" />
          <path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 3.9" />
          <path d="M12 17.2h.01" />
        </svg>
      </button>
      {open && (
        <div className="help-menu" role="menu" aria-label="Help" data-testid="help-menu">
          <button type="button" role="menuitem" onClick={() => choose(start)}>
            <b>Take the walkthrough</b>
            <span className="muted small">A quick guided tour, about 2 minutes</span>
          </button>
          <button type="button" role="menuitem" onClick={() => choose(() => navigate('/help'))}>
            <b>Study Forge Academy</b>
            <span className="muted small">Hands-on lessons for every feature</span>
          </button>
        </div>
      )}
    </div>
  );
}
