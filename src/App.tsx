import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { dateFormatVersion, subscribeDateFormat } from './data/dateFormat';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AccountMenu } from './components/AccountMenu';
import { NAV_ICONS } from './components/NavIcons';
import { WalkthroughProvider } from './features/walkthrough/Walkthrough';
import { CalculatorProvider } from './components/calculator/CalculatorWindow';
import { TermsPage } from './features/TermsPage';
import { AcademyPage } from './features/academy/AcademyPage';
import { SemesterPage } from './features/SemesterPage';
import { AgreementPage } from './features/AgreementPage';
import { agreedNow, subscribeAgreement } from './data/agreement';
import { RecorderProvider, RecordingBar } from './components/Recorder';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CalendarOffer } from './components/CalendarOffer';
import { OfflineNotices } from './components/OfflineNotices';
import { SaveProvider, SavePanel } from './components/SaveQueue';
import { UndoBar } from './components/UndoBar';
import { CourseDetailPage } from './features/CourseDetailPage';
import { CoursesPage } from './features/CoursesPage';
import { LibraryPage } from './features/LibraryPage';
import { NoteEditorPage } from './features/NoteEditorPage';
import { NotesPage } from './features/NotesPage';
import { CheckpointEditorPage } from './features/guided/CheckpointEditorPage';
import { LessonPage } from './features/guided/LessonPage';
import { SessionPage } from './features/guided/SessionPage';
import { StudyPage } from './features/guided/StudyPage';
import { RecordPage } from './features/RecordPage';
import { AuthShell, AuthTabsPage, ForgotEmailPage, ForgotPasswordPage, PrivacyPage } from './features/AuthPages';
import { HomePage } from './features/HomePage';
import { isNewVisitor, WELCOME_SEEN_EVENT } from './data/firstVisit';
import { getActiveAccount } from './data/account';

/** Every way into an account. These render on their own page, outside the dashboard. */
const AUTH_ROUTES = ['/auth', '/login', '/signup', '/sign-in', '/sign-up', '/forgot-password', '/forgot-email', '/account-recovery'];
import { SearchPage } from './features/SearchPage';
import { CramPage } from './features/CramPage';
import { ExamHallPage } from './features/ExamHallPage';
import { ExamResultPage } from './features/ExamResultPage';
import { ExamRunPage } from './features/ExamRunPage';
import { ExamStartPage } from './features/ExamStartPage';
import { DeckPage } from './features/DeckPage';
import { FlashcardsPage } from './features/FlashcardsPage';
import { ReviewPage } from './features/ReviewPage';
import { PracticePage } from './features/PracticePage';
import { PracticeSessionPage } from './features/PracticeSessionPage';
import { PracticeSetPage } from './features/PracticeSetPage';
import { PlannerItemPage } from './features/PlannerItemPage';
import { PlannerPage } from './features/PlannerPage';
import { CalendarEventPage } from './features/CalendarEventPage';
import { CalendarPage } from './features/CalendarPage';
import { GoogleCalendarPage } from './features/GoogleCalendarPage';
import { ProgressPage } from './features/ProgressPage';
import { BinPage } from './features/BinPage';
import { SchedulePage } from './features/SchedulePage';
import { SettingsPage } from './features/SettingsPage';
import { TodayPage } from './features/TodayPage';

// The viewer loads the PDF reader, so it only downloads when a file is opened.
const ViewerPage = lazy(() => import('./features/ViewerPage'));

const MAIN_LINKS = [
  { to: '/', label: 'Today', end: true },
  { to: '/courses', label: 'Courses', end: false },
  { to: '/library', label: 'Library', end: false },
  { to: '/planner', label: 'Planner', end: false },
  { to: '/calendar', label: 'Calendar', end: false },
  { to: '/cards', label: 'Flashcards', end: false },
  { to: '/practice', label: 'Practice', end: false },
  { to: '/exams', label: 'Exam Hall', end: false },
  { to: '/progress', label: 'Progress', end: false },
  { to: '/study', label: 'Study', end: false },
  { to: '/notes', label: 'Notes', end: false },
  { to: '/record', label: 'Record', end: false },
];

function NotFound() {
  return (
    <div className="page">
      <h1>This page doesn't exist</h1>
      <NavLink to="/">Go to Today</NavLink>
    </div>
  );
}

export function App() {
  const { pathname } = useLocation();
  // A new date or time format redraws every screen at once.
  useSyncExternalStore(subscribeDateFormat, dateFormatVersion);
  // Undecided until the device has been looked at. Only someone with no account and no work of
  // their own is met by the welcome page instead of their own dashboard.
  const [newVisitor, setNewVisitor] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    isNewVisitor(Boolean(getActiveAccount())).then((answer) => { if (active) setNewVisitor(answer); });
    const started = () => setNewVisitor(false);
    window.addEventListener(WELCOME_SEEN_EVENT, started);
    return () => { active = false; window.removeEventListener(WELCOME_SEEN_EVENT, started); };
  }, []);
  const agreed = useSyncExternalStore(subscribeAgreement, agreedNow);
  const [updateBlocked, setUpdateBlocked] = useState(false);
  useEffect(() => {
    // On a phone the bar slides, so the current section is kept in view.
    document.querySelector('.nav-links a.active')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [pathname]);
  useEffect(() => {
    const show = () => setUpdateBlocked(true);
    window.addEventListener('study-forge-update-blocked', show);
    return () => window.removeEventListener('study-forge-update-blocked', show);
  }, []);
  // The way in is its own page. It never borrows the student dashboard's shell: no main navigation,
  // no account bar, no recording bar, no floating controls.
  if (pathname === '/welcome') return <HomePage />;
  // A new visitor meets the welcome page first; everyone else goes straight to their own work.
  if (pathname === '/' && newVisitor === null) return <p className="page muted">Loading…</p>;
  if (pathname === '/' && newVisitor) return <HomePage />;

  // Nobody uses Study Forge, signed in or not, until they've opened and agreed to the Terms of Use
  // and the Privacy Policy. Both documents can still be read on their own.
  if (!agreed) {
    return (
      <AuthShell>
        {pathname === '/terms' ? <TermsPage /> : pathname === '/privacy' ? <PrivacyPage /> : <AgreementPage />}
      </AuthShell>
    );
  }

  if (AUTH_ROUTES.includes(pathname)) {
    return (
      <AuthShell>
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<p className="muted">Loading…</p>}>
            <Routes>
              <Route path="/auth" element={<AuthTabsPage mode="sign-in" />} />
              <Route path="/login" element={<AuthTabsPage mode="sign-in" />} />
              <Route path="/signup" element={<AuthTabsPage mode="sign-up" />} />
              {/* The older addresses still work, so saved links and bookmarks don't break. */}
              <Route path="/sign-in" element={<AuthTabsPage mode="sign-in" />} />
              <Route path="/sign-up" element={<AuthTabsPage mode="sign-up" />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/forgot-email" element={<ForgotEmailPage />} />
              <Route path="/account-recovery" element={<ForgotEmailPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </AuthShell>
    );
  }

  return (
    <SaveProvider>
    <RecorderProvider>
    <WalkthroughProvider>
    <CalculatorProvider>
      <div className="shell">
        <a className="skip" href="#content" onClick={(event) => {
          event.preventDefault();
          document.getElementById('content')?.focus();
        }}>Skip to content</a>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" className="brand" aria-label="Study Forge, go to Today">
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
            Study Forge
          </NavLink>
          <div className="nav-links">
            {MAIN_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end}>{NAV_ICONS[link.to]}<span>{link.label}</span></NavLink>
            ))}
          </div>
        </nav>
        <div className="workspace">
        <AccountMenu />
        <OfflineNotices />
        <CalendarOffer />
        <main id="content" tabIndex={-1}>
          {updateBlocked && <p className="notice" role="alert">Study Forge was updated. Close its other tabs, then reload this one. Your files are safe.</p>}
          <RecordingBar />
          {/* Each screen fails alone. key resets the boundary after moving to another screen. */}
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<p className="page muted">Loading…</p>}>
              <Routes>
                <Route path="/" element={<TodayPage />} />
                <Route path="/courses" element={<CoursesPage />} />
                <Route path="/courses/new-semester" element={<SemesterPage />} />
                <Route path="/courses/:id" element={<CourseDetailPage />} />
                <Route path="/library" element={<LibraryPage />} />
                <Route path="/files/:id" element={<ViewerPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/calendar/schedule" element={<SchedulePage />} />
                <Route path="/calendar/google" element={<GoogleCalendarPage />} />
                <Route path="/calendar/event/:id" element={<CalendarEventPage />} />
                <Route path="/progress" element={<ProgressPage />} />
                <Route path="/bin" element={<BinPage />} />
                <Route path="/planner" element={<PlannerPage />} />
                <Route path="/planner/:id" element={<PlannerItemPage />} />
                <Route path="/cards" element={<FlashcardsPage />} />
                <Route path="/cards/review" element={<ReviewPage />} />
                <Route path="/cards/:id" element={<DeckPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/help" element={<AcademyPage />} />
                <Route path="/academy" element={<AcademyPage />} />
                <Route path="/practice" element={<PracticePage />} />
                <Route path="/practice/session" element={<PracticeSessionPage />} />
                <Route path="/practice/:id" element={<PracticeSetPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/exams" element={<ExamHallPage />} />
                <Route path="/exams/start" element={<ExamStartPage />} />
                <Route path="/exams/run" element={<ExamRunPage />} />
                <Route path="/exams/result/:id" element={<ExamResultPage />} />
                <Route path="/exams/cram" element={<CramPage />} />
                <Route path="/study" element={<StudyPage />} />
                <Route path="/study/lessons/:id" element={<LessonPage />} />
                <Route path="/study/lessons/:lessonId/checkpoints/:id/edit" element={<CheckpointEditorPage />} />
                <Route path="/study/checkpoints/:id" element={<SessionPage />} />
                <Route path="/notes" element={<NotesPage />} />
                <Route path="/notes/:id" element={<NoteEditorPage />} />
                <Route path="/record" element={<RecordPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        </div>
        <UndoBar />
        <SavePanel />
      </div>
    </CalculatorProvider>
    </WalkthroughProvider>
    </RecorderProvider>
    </SaveProvider>
  );
}
