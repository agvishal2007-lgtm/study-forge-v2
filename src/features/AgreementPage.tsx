import { useEffect, useRef, useState, type ReactNode } from 'react';
import { recordAgreement } from '../data/agreement';
import { PrivacyContent } from './AuthPages';
import { TermsContent } from './TermsPage';

type Doc = 'terms' | 'privacy';
const TITLE: Record<Doc, string> = { terms: 'Terms of Use', privacy: 'Privacy Policy' };

/** The full document in a window over this screen, so nothing here is lost by opening it. */
function DocumentWindow({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    return () => element?.close();
  }, []);
  const content: ReactNode = doc === 'terms' ? <TermsContent /> : <PrivacyContent />;
  return (
    <dialog ref={dialog} className="dialog legal-dialog" aria-labelledby="legal-title" onCancel={(event) => { event.preventDefault(); onClose(); }} data-testid={`read-${doc}`}>
      <div className="legal-dialog-head">
        <h2 id="legal-title">{TITLE[doc]}</h2>
        <button type="button" className="icon-button" aria-label={`Close ${TITLE[doc]}`} onClick={onClose}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="legal-dialog-body legal-page">{content}</div>
      <div className="session-actions"><button type="button" className="button primary" onClick={onClose}>Done reading</button></div>
    </dialog>
  );
}

/**
 * Before anyone uses Study Forge, with or without an account: open the Terms of Use and the Privacy
 * Policy, tick that you agree to each, then continue. A box can't be ticked until its document has
 * been opened.
 */
export function AgreementPage() {
  const [opened, setOpened] = useState<Record<Doc, boolean>>({ terms: false, privacy: false });
  const [agreed, setAgreed] = useState<Record<Doc, boolean>>({ terms: false, privacy: false });
  const [reading, setReading] = useState<Doc | null>(null);
  const openDoc = (doc: Doc) => {
    setOpened((now) => ({ ...now, [doc]: true }));
    setReading(doc);
  };
  const row = (doc: Doc) => (
    <li className="agree-row" key={doc}>
      <button type="button" className="button" onClick={() => openDoc(doc)} data-testid={`open-${doc}`}>
        {opened[doc] ? `Open the ${TITLE[doc]} again` : `Open the ${TITLE[doc]}`}
      </button>
      <label className={`agree-check${opened[doc] ? '' : ' agree-locked'}`}>
        <input
          type="checkbox"
          disabled={!opened[doc]}
          checked={agreed[doc]}
          aria-describedby={opened[doc] ? undefined : `${doc}-hint`}
          onChange={(event) => setAgreed((now) => ({ ...now, [doc]: event.target.checked }))}
        />
        <span>I have read and agree to the {TITLE[doc]}</span>
      </label>
      {!opened[doc] && <p className="muted small" id={`${doc}-hint`}>Open it first to tick this box.</p>}
    </li>
  );
  const ready = agreed.terms && agreed.privacy;
  return (
    <div className="page auth-page agreement-page" data-testid="agreement">
      <h1>Before you start</h1>
      <p>Please open and agree to the Terms of Use and the Privacy Policy. They explain how Study Forge works, what it keeps, and the rules for using it, including using the calculator honestly.</p>
      <ul className="plain-list agree-list">{row('terms')}{row('privacy')}</ul>
      <div className="session-actions">
        <button type="button" className="button primary" disabled={!ready} onClick={recordAgreement}>Continue</button>
      </div>
      {!ready && <p className="muted small">Continue unlocks once both boxes are ticked. You’re asked once on each device, and again only if either document changes.</p>}
      {reading && <DocumentWindow doc={reading} onClose={() => setReading(null)} />}
    </div>
  );
}
