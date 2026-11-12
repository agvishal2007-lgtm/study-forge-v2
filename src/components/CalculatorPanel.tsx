import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator, type AngleMode, type CalcResult, type ShowAs } from '../data/calculatorRules';
import { freshGraphingState, GraphingPad, type GraphingState } from './calculator/GraphingPad';
import { ScientificPad } from './calculator/ScientificPad';

const MODE_KEY = 'study-forge-calc-angle';
const SHOW_KEY = 'study-forge-calc-show';
const KIND_KEY = 'study-forge-calc-kind';
const remembered = <T extends string>(key: string, allowed: T[], fallback: T): T => {
  try {
    const saved = localStorage.getItem(key) as T | null;
    return saved && allowed.includes(saved) ? saved : fallback;
  } catch {
    return fallback;
  }
};
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* private browsing */ } };

export const STUDY_TOOL_NOTICE = 'Study Forge Calculator is a study tool and is not an officially approved examination calculator. Follow your instructor’s and examination provider’s calculator rules.';
/** Who is responsible for how it's used. */
export const RESPONSIBILITY_NOTICE = 'You are responsible for using it honestly. Study Forge is not responsible for any use that breaks a school, exam or academic-integrity rule, including cheating.';

/**
 * Study Forge's own calculator, with a Scientific mode and a TI-84-style Graphing mode. Both share
 * one engine, so Ans, stored values and the angle setting carry across when switching. Everything
 * runs on the device.
 */
export default function CalculatorPanel({ onInsert, onClose }: { onInsert?: (tex: string) => void; onClose?: () => void }) {
  const [kind, setKind] = useState<'scientific' | 'graphing'>(() => remembered(KIND_KEY, ['scientific', 'graphing'], 'scientific'));
  const [angle, setAngle] = useState<AngleMode>(() => remembered(MODE_KEY, ['deg', 'rad'], 'deg'));
  const [showAs, setShowAs] = useState<ShowAs>(() => remembered(SHOW_KEY, ['decimal', 'fraction'], 'decimal'));
  const calc = useMemo(() => new Calculator(angle), []);
  calc.setMode(angle);
  calc.showAs = showAs;
  const [sciInput, setSciInput] = useState('');
  const [history, setHistory] = useState<CalcResult[]>([]);
  const [graphing, setGraphing] = useState<GraphingState>(freshGraphingState);

  const chooseAngle = (next: AngleMode) => { setAngle(next); remember(MODE_KEY, next); };
  const switchTo = (next: 'scientific' | 'graphing') => {
    if (next === kind) return;
    // What's being typed goes along, so switching never loses it.
    if (next === 'graphing' && sciInput && !graphing.entry) {
      setGraphing((now) => ({ ...now, entry: sciInput }));
      setSciInput('');
    } else if (next === 'scientific' && graphing.entry && !sciInput) {
      setSciInput(graphing.entry);
      setGraphing((now) => ({ ...now, entry: '' }));
    }
    setKind(next);
    remember(KIND_KEY, next);
  };

  return (
    <section className={`calc-panel calc-${kind}`} aria-label="Calculator" data-testid="calculator">
      <div className="calc-head">
        <div className="calc-tabs" role="tablist" aria-label="Calculator mode">
          <button type="button" role="tab" aria-selected={kind === 'scientific'} className="button" onClick={() => switchTo('scientific')}>Scientific</button>
          <button type="button" role="tab" aria-selected={kind === 'graphing'} className="button" onClick={() => switchTo('graphing')}>Graphing</button>
        </div>
        {onClose && (
          <button type="button" className="icon-button calc-close" aria-label="Close calculator" title="Close calculator" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>
      <p className="calc-warning" role="note" data-testid="calc-warning">{STUDY_TOOL_NOTICE} {RESPONSIBILITY_NOTICE} <Link to="/terms" onClick={onClose}>Terms of Use</Link></p>
      <div className="calc-segment" role="group" aria-label="Angles">
        <button type="button" className="button" aria-pressed={angle === 'deg'} onClick={() => chooseAngle('deg')}>Degrees</button>
        <button type="button" className="button" aria-pressed={angle === 'rad'} onClick={() => chooseAngle('rad')}>Radians</button>
      </div>
      <div hidden={kind !== 'scientific'}>
        <ScientificPad calc={calc} showAs={showAs} onShowAs={(next) => { setShowAs(next); remember(SHOW_KEY, next); }}
          input={sciInput} setInput={setSciInput} history={history} setHistory={setHistory} onInsert={onInsert} />
      </div>
      <div hidden={kind !== 'graphing'}>
        <GraphingPad calc={calc} angle={angle} onAngle={chooseAngle} state={graphing} setState={setGraphing} onInsert={onInsert} />
      </div>
    </section>
  );
}
