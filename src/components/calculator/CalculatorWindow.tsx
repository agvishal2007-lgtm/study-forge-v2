import { useLocation } from 'react-router-dom';
import { Component, createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

// The calculator's code loads the first time it's opened, so other screens stay quick.
const loadPanel = () => import('../CalculatorPanel');
const CalculatorPanel = lazy(loadPanel);

interface CalculatorApi {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** The screen that can take answers, such as an open note. Null when nothing can. */
  setInsertTarget: (insert: ((tex: string) => void) | null) => void;
}

const CalculatorContext = createContext<CalculatorApi | null>(null);

export function useCalculator(): CalculatorApi {
  const value = useContext(CalculatorContext);
  if (!value) throw new Error('useCalculator must be used inside CalculatorProvider');
  return value;
}

/** If the calculator's code can't load (offline before it was ever saved, say), it says so and offers to try again. */
class LoadGuard extends Component<{ children: ReactNode; onRetry: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="calc-load-failed" role="alert">
        <p>The calculator couldn’t open. If you’re offline, connect to the internet once so it can be saved to this device.</p>
        <button type="button" className="button" onClick={() => { this.setState({ failed: false }); this.props.onRetry(); }}>Try again</button>
      </div>
    );
  }
}

/**
 * One calculator for the whole site. It floats above the page, so it is always visible wherever it
 * was opened, keeps everything typed in it when closed and reopened, and never opens twice.
 */
export function CalculatorProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [canInsert, setCanInsert] = useState(false);
  const insertRef = useRef<((tex: string) => void) | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const open = useCallback(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEverOpened(true);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    returnFocus.current?.focus?.({ preventScroll: true });
  }, []);
  const toggle = useCallback(() => (isOpen ? close() : open()), [isOpen, open, close]);
  const setInsertTarget = useCallback((insert: ((tex: string) => void) | null) => {
    insertRef.current = insert;
    setCanInsert(!!insert);
  }, []);

  // Opening moves focus into it, so keyboard and screen-reader users land in the calculator.
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      windowRef.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true], .calc-close')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, everOpened]);

  // Escape closes it from anywhere, except on the graphing screen, where Escape means CLEAR, and
  // while another window (such as a confirmation) is open on top.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('.ti-screen') || document.querySelector('dialog[open]')) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // On a wide screen the page makes room beside it, so nothing on the page is covered.
  useEffect(() => {
    document.body.classList.toggle('calc-docked', isOpen);
    return () => document.body.classList.remove('calc-docked');
  }, [isOpen]);

  // A timed mock exam is practice for the real thing, so the calculator closes there.
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith('/exams/run')) setOpen(false);
  }, [pathname]);

  const value = useMemo(() => ({ isOpen, open, close, toggle, setInsertTarget }), [isOpen, open, close, toggle, setInsertTarget]);
  const insert = useCallback((tex: string) => insertRef.current?.(tex), []);

  return (
    <CalculatorContext.Provider value={value}>
      {children}
      {everOpened && (
        <div
          ref={windowRef}
          className="calc-window"
          role="dialog"
          aria-modal="false"
          aria-label="Calculator"
          hidden={!isOpen}
          data-testid="calc-window"
        >
          <LoadGuard key={attempt} onRetry={() => setAttempt((n) => n + 1)}>
            <Suspense fallback={<p className="calc-loading muted" role="status">Opening the calculator…</p>}>
              <CalculatorPanel onClose={close} onInsert={canInsert ? insert : undefined} />
            </Suspense>
          </LoadGuard>
        </div>
      )}
    </CalculatorContext.Provider>
  );
}

/** A button that opens and closes the calculator, for screens where working things out helps. */
export function CalculatorButton({ className = 'button' }: { className?: string }) {
  const { isOpen, toggle } = useCalculator();
  return (
    <button type="button" className={className} aria-pressed={isOpen} onClick={toggle} data-testid="open-calculator">
      {isOpen ? 'Close calculator' : 'Calculator'}
    </button>
  );
}
