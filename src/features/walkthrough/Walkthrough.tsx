import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { getDb } from '../../data/db';
import { TOUR_STEPS } from './steps';

const STATE_KEY = 'walkthrough';
const FIND_TARGET_MS = 1500;
const BOX_PADDING = 6;
const CARD_GAP = 14;

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
}

/** The target's visible area, kept inside the screen and any scrolling panel around it. */
function visibleBox(element: Element): Box {
  const rect = element.getBoundingClientRect();
  let top = rect.top;
  let left = rect.left;
  let right = rect.right;
  let bottom = rect.bottom;
  const panel = element.closest('main');
  if (panel) {
    const limit = panel.getBoundingClientRect();
    top = Math.max(top, limit.top);
    left = Math.max(left, limit.left);
    right = Math.min(right, limit.right);
    bottom = Math.min(bottom, limit.bottom);
  }
  const edge = BOX_PADDING + 3;
  top = Math.max(top - BOX_PADDING, edge - BOX_PADDING);
  left = Math.max(left - BOX_PADDING, edge - BOX_PADDING);
  right = Math.min(right + BOX_PADDING, window.innerWidth - 3);
  bottom = Math.min(bottom + BOX_PADDING, window.innerHeight - 3);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/** Puts the explanation beside the box when there's room, and otherwise wherever it fits. */
function placeCard(box: Box | null, width: number, height: number): { top: number; left: number } {
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const margin = 12;
  const clampLeft = (value: number) => Math.min(Math.max(margin, value), screenW - width - margin);
  const clampTop = (value: number) => Math.min(Math.max(margin, value), screenH - height - margin);
  if (!box) return { top: clampTop((screenH - height) / 2), left: clampLeft((screenW - width) / 2) };
  const roomBelow = screenH - (box.top + box.height) - CARD_GAP - margin;
  const roomAbove = box.top - CARD_GAP - margin;
  const roomRight = screenW - (box.left + box.width) - CARD_GAP - margin;
  if (roomRight >= width) return { top: clampTop(box.top), left: box.left + box.width + CARD_GAP };
  if (roomBelow >= height) return { top: box.top + box.height + CARD_GAP, left: clampLeft(box.left) };
  if (roomAbove >= height) return { top: box.top - height - CARD_GAP, left: clampLeft(box.left) };
  // A tall section fills the screen, so the card sits along the bottom edge and covers part of it.
  return { top: screenH - height - margin, left: clampLeft(box.left + (box.width - width) / 2) };
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
  const [box, setBox] = useState<Box | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cardPosition, setCardPosition] = useState<{ top: number; left: number } | null>(null);

  // The rest of the app can't be clicked, tabbed to, or read out while this is open.
  useEffect(() => {
    const root = document.getElementById('root');
    root?.setAttribute('inert', '');
    return () => root?.removeAttribute('inert');
  }, []);

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
      const routeOk = !definition.route || (window.location.hash.replace(/^#/, '').split('?')[0] || '/') === definition.route;
      const element = routeOk ? findTarget(definition.target) : null;
      if (element) {
        if (scrolledTo !== element) {
          scrolledTo = element;
          const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          // A tall section starts at its top, and anything smaller is centered.
          const panel = element.closest('main');
          const tall = panel && element.getBoundingClientRect().height > panel.clientHeight * 0.8;
          element.scrollIntoView({ block: tall ? 'start' : 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
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
      if (!card.current) return;
      const { offsetWidth, offsetHeight } = card.current;
      setCardPosition(placeCard(box, offsetWidth, offsetHeight));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [box, step, notFound]);

  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;
  const percent = Math.round((step / TOUR_STEPS.length) * 100);
  const waiting = !!definition.target && !box && !notFound;

  // The Next button is briefly disabled while a section is found, so focus waits until it's ready.
  useEffect(() => {
    if (!waiting) primary.current?.focus({ preventScroll: true });
  }, [step, waiting]);

  // Keys work even if focus has landed nowhere, and Tab can't leave the walkthrough.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onPause();
      } else if (event.key === 'Tab') {
        const items = [...(card.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!card.current?.contains(active)) {
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

  return createPortal(
    <div className="tour">
      {/* Catches every click outside the explanation. */}
      <div className="tour-blocker" data-testid="tour-blocker" />
      {box
        ? <div className="tour-box" data-testid="tour-box" style={{ top: box.top, left: box.left, width: box.width, height: box.height }} />
        : <div className="tour-dark" />}
      <div
        ref={card}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        data-testid="tour-card"
        data-step={definition.id}
        style={cardPosition ? { top: cardPosition.top, left: cardPosition.left } : { visibility: 'hidden', top: 0, left: 0 }}
      >
        <p className="tour-count" data-testid="tour-count">Step {step + 1} of {TOUR_STEPS.length}, {percent}% complete</p>
        <div className="meter" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Walkthrough progress">
          <span style={{ width: `${percent}%` }} />
        </div>
        <h2 id="tour-title" aria-live="polite">{definition.title}</h2>
        <p id="tour-body">{definition.body}</p>
        {notFound && <p className="muted" data-testid="tour-missing">This part isn't on the screen right now, so there's nothing to highlight. You can keep going.</p>}
        <div className="tour-actions">
          {isLast
            ? <button ref={primary} className="button primary" onClick={onFinish}>Finish</button>
            : <button ref={primary} className="button primary" disabled={waiting} onClick={() => onStep(step + 1)}>{isFirst ? 'Start' : 'Next'}</button>}
          {!isFirst && <button className="button" onClick={() => onStep(step - 1)}>Back</button>}
          {!isLast && <button className="text-button" onClick={onPause}>Skip for now</button>}
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

  // A new student sees it once. Coming back mid-way picks up at the same step.
  useEffect(() => {
    let active = true;
    void loadTour().then((saved) => {
      if (!active) return;
      savedRef.current = saved;
      // Automated browsers only get it when a test asks, so other tests aren't interrupted.
      const automated = navigator.webdriver && !(window as unknown as { __testWalkthrough?: boolean }).__testWalkthrough;
      if (automated) return;
      if (!saved) open(0);
      else if (saved.status === 'active') open(saved.step);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [open]);

  const begin = useCallback(() => {
    const saved = savedRef.current;
    open(saved?.status === 'paused' ? saved.step : 0);
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

export function WalkthroughButton() {
  const { start } = useWalkthrough();
  return (
    <button className="icon-button" aria-label="Walkthrough" title="Walkthrough" onClick={start}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9.2" />
        <path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 3.9" />
        <path d="M12 17.2h.01" />
      </svg>
    </button>
  );
}
