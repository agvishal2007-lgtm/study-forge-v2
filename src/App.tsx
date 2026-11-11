import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AccountMenu } from './components/AccountMenu';
import { NAV_ICONS } from './components/NavIcons';
import { WalkthroughProvider } from './features/walkthrough/Walkthrough';
import { RecorderProvider, RecordingBar } from './components/Recorder';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CalendarOffer } from './components/CalendarOffer';
import { OfflineNotices } from './components/OfflineNotices';
import { SaveProvider, SavePanel } from './components/SaveQueue';
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
import { AuthTabsPage, ForgotEmailPage, ForgotPasswordPage, PrivacyPage } from './features/AuthPages';
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
  return (
    <SaveProvider>
    <RecorderProvider>
    <WalkthroughProvider>
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
                <Route path="/auth" element={<AuthTabsPage mode="sign-in" />} />
                <Route path="/login" element={<AuthTabsPage mode="sign-in" />} />
                <Route path="/signup" element={<AuthTabsPage mode="sign-up" />} />
                {/* The older addresses still work, so saved links and bookmarks don't break. */}
                <Route path="/sign-in" element={<AuthTabsPage mode="sign-in" />} />
                <Route path="/sign-up" element={<AuthTabsPage mode="sign-up" />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/forgot-email" element={<ForgotEmailPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
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
        <SavePanel />
      </div>
    </WalkthroughProvider>
    </RecorderProvider>
    </SaveProvider>
  );
}
