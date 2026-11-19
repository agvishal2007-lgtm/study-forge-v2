import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import {
  applyClassroomImport, clearClassroomConnection, describePlan, describeReport, getClassroomConnection,
  planClassroomImport, saveClassroomConnection, type ClassroomReport, type ImportPlan,
} from '../data/classroom';
import { ClassroomError, askClassroom, fetchClassroom, forgetClassroom, hasClassroomAccess, prepareClassroom } from '../data/googleClassroom';
import { getActiveAccount } from '../data/account';
import { localNow } from '../data/plannerRules';
import { isDeviceOnly, useSchool, wordsFor } from '../data/schoolLevel';
import { useLive } from '../data/useLive';

/**
 * Bringing classes and work in from Google Classroom, read only.
 *
 * Two things are said plainly rather than buried. Study Forge can only read, and only this student's
 * own classes and the work set in them — it cannot post, mark, or see anyone else's work. And a
 * school-managed account will be refused until the school's own administrator allows Study Forge,
 * which is Google's rule and not something the student can turn on. Saying so up front is kinder
 * than letting them hit a blank refusal.
 *
 * Nothing is changed until the student has seen what would change.
 */
export function ClassroomPage() {
  const school = useSchool();
  const words = wordsFor(school.level, school.termKind);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [refused, setRefused] = useState<string[]>([]);
  const [report, setReport] = useState<ClassroomReport | null>(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [approvalNeeded, setApprovalNeeded] = useState(false);
  const { data } = useLive(async () => ({ connection: await getClassroomConnection() }));

  // Google's code is loaded ahead of the tap, because a window opened late gets blocked.
  useEffect(() => { void prepareClassroom().catch(() => undefined); }, []);

  const offLimits = isDeviceOnly();

  const show = (error: unknown) => {
    const failure = error as ClassroomError;
    if (failure?.cancelled) { setProblem(''); return; }
    setApprovalNeeded(Boolean(failure?.needsSchoolApproval));
    setProblem(failure?.message || 'That did not work. Try again.');
  };

  /** Connecting and looking: the ask happens first, with nothing awaited before it. */
  const connect = () => {
    setProblem('');
    setApprovalNeeded(false);
    setBusy('Asking Google…');
    askClassroom(getActiveAccount()?.email)
      .then(async () => {
        setBusy('Reading your classes…');
        await saveClassroomConnection({
          email: getActiveAccount()?.email ?? '',
          connectedAt: Date.now(),
          lastImportAt: 0,
        });
        await look();
      })
      .catch((error) => { setBusy(''); show(error); });
  };

  const look = async () => {
    setBusy('Reading your classes…');
    setReport(null);
    try {
      const found = await fetchClassroom();
      setRefused(found.refused);
      setPlan(await planClassroomImport(found.courses, found.work, localNow().date));
      setBusy('');
    } catch (error) {
      setBusy('');
      show(error);
    }
  };

  const bring = async () => {
    if (!plan) return;
    setBusy('Bringing them in…');
    try {
      setReport(await applyClassroomImport(plan, refused));
      setPlan(null);
      setBusy('');
    } catch (error) {
      setBusy('');
      show(error);
    }
  };

  if (offLimits) {
    return (
      <div className="page">
        <Breadcrumbs trail={[{ label: 'Courses', to: '/courses' }, { label: 'Google Classroom' }]} />
        <h1>Google Classroom</h1>
        <p className="muted" data-testid="classroom-device-only">
          Study Forge is set to keep everything on this device at your school level, so it never signs
          in to Google — which means Classroom can't be connected here. Plenty of schools do use
          Classroom at this level; this is a deliberate choice about accounts, not a gap. You can add
          your {words.courses} by hand, or from a photo of your schedule.
        </p>
        <p className="row-actions">
          <Link className="button" to="/courses">Go to {words.Courses}</Link>
          <Link className="button" to="/schedule">Add a class schedule</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs trail={[{ label: 'Courses', to: '/courses' }, { label: 'Google Classroom' }]} />
      <h1>Google Classroom</h1>

      <p className="muted" data-testid="classroom-honesty">
        Study Forge can only <b>read</b> your own classes and the work set in them. It cannot post,
        hand anything in, change a grade, or see anyone else's work. Nothing is brought in until you
        have seen what it would add.
      </p>
      <p className="muted small" data-testid="classroom-school-note">
        If your school manages your Google account, Google will refuse this until your school's
        administrator has allowed Study Forge — that's Google's rule for school accounts, and it
        isn't something you can switch on yourself. A personal Google account doesn't need that.
      </p>

      {problem && (
        <div className="error" role="alert">
          <p>{problem}</p>
          {approvalNeeded && (
            <p className="muted small">
              Nothing is wrong with your sign-in. Until then, you can add {words.courses} by hand or
              from a photo of your schedule, and Google Calendar may still work.
            </p>
          )}
        </div>
      )}
      {busy && <p className="muted" role="status" data-testid="classroom-busy">{busy}</p>}

      {!data?.connection && !hasClassroomAccess() ? (
        <p className="row-actions">
          <button className="button primary" type="button" onClick={connect} data-testid="classroom-connect">
            Connect Google Classroom
          </button>
        </p>
      ) : (
        <>
          <p className="muted small" data-testid="classroom-connected">
            Connected{data?.connection?.email ? ` as ${data.connection.email}` : ''}.
            {data?.connection?.lastImportAt ? ' Brought in once already.' : ''}
          </p>
          <p className="row-actions">
            <button className="button primary" type="button" onClick={() => void look()} data-testid="classroom-look">
              Get the latest from Classroom
            </button>
            <button
              className="button"
              type="button"
              data-testid="classroom-disconnect"
              onClick={() => { forgetClassroom(); void clearClassroomConnection(); setPlan(null); setReport(null); }}
            >
              Disconnect
            </button>
          </p>
        </>
      )}

      {plan && (
        <section aria-labelledby="plan-heading" data-testid="classroom-plan">
          <h2 id="plan-heading">What this would bring in</h2>
          <p><b>{describePlan(plan)}</b></p>
          {plan.newCourses.length > 0 && (
            <>
              <h3>New {words.courses}</h3>
              <ul className="plain-list">
                {plan.newCourses.map((one) => <li key={one.classroomId}>{one.name}</li>)}
              </ul>
            </>
          )}
          {plan.work.length > 0 && (
            <>
              <h3>Work</h3>
              <ul className="plain-list" data-testid="classroom-work">
                {plan.work.map((one) => (
                  <li key={one.id}>
                    {one.title} <span className="muted small">{one.due ? `due ${one.due}` : 'no due date in Classroom'} · {one.type}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {plan.skipped.length > 0 && (
            <>
              <h3>Left out</h3>
              <ul className="plain-list" data-testid="classroom-skipped">
                {plan.skipped.map((one) => <li key={one.title}>{one.title} <span className="muted small">— {one.because}</span></li>)}
              </ul>
            </>
          )}
          {refused.length > 0 && (
            <p className="muted small" data-testid="classroom-refused">
              These classes wouldn't share their work: {refused.join(', ')}. That is set by the school
              or the teacher, not by Study Forge.
            </p>
          )}
          <p className="row-actions">
            <button className="button primary" type="button" onClick={() => void bring()} data-testid="classroom-apply">
              Bring these in
            </button>
            <button className="button" type="button" onClick={() => setPlan(null)}>Not now</button>
          </p>
        </section>
      )}

      {report && (
        <section aria-labelledby="report-heading">
          <h2 id="report-heading">Done</h2>
          <p data-testid="classroom-report">{describeReport(report)}</p>
          <p className="muted small">
            Work you have already finished is never marked unfinished by an import, and a {words.course}{' '}
            you rename keeps your name. <Link to="/planner">Go to the Planner</Link>
          </p>
        </section>
      )}
    </div>
  );
}
