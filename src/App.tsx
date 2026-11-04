import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { AccountMenu } from './components/AccountMenu';
import { WalkthroughProvider } from './features/walkthrough/Walkthrough';
import { RecorderProvider, RecordingBar } from './components/Recorder';
import { ErrorBoundary } from './components/ErrorBoundary';
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
import { AuthPage, ForgotEmailPage, ForgotPasswordPage, PrivacyPage } from './features/AuthPages';
import { DeckPage } from './features/DeckPage';
import { FlashcardsPage } from './features/FlashcardsPage';
import { ReviewPage } from './features/ReviewPage';
import { PracticePage } from './features/PracticePage';
import { PracticeSessionPage } from './features/PracticeSessionPage';
import { PracticeSetPage } from './features/PracticeSetPage';
import { PlannerItemPage } from './features/PlannerItemPage';
import { PlannerPage } from './features/PlannerPage';
import { SettingsPage } from './features/SettingsPage';
import { TodayPage } from './features/TodayPage';

// The viewer loads the PDF reader, so it only downloads when a file is opened.
const ViewerPage = lazy(() => import('./features/ViewerPage'));

const MAIN_LINKS = [
  { to: '/', label: 'Today', end: true },
  { to: '/courses', label: 'Courses', end: false },
  { to: '/library', label: 'Library', end: false },
  { to: '/planner', label: 'Planner', end: false },
  { to: '/cards', label: 'Flashcards', end: false },
  { to: '/practice', label: 'Practice', end: false },
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
              <NavLink key={link.to} to={link.to} end={link.end}>{link.label}</NavLink>
            ))}
          </div>
        </nav>
        <div className="workspace">
        <AccountMenu />
        <OfflineNotices />
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
                <Route path="/planner" element={<PlannerPage />} />
                <Route path="/planner/:id" element={<PlannerItemPage />} />
                <Route path="/cards" element={<FlashcardsPage />} />
                <Route path="/cards/review" element={<ReviewPage />} />
                <Route path="/cards/:id" element={<DeckPage />} />
                <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
                <Route path="/sign-up" element={<AuthPage mode="sign-up" />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/forgot-email" element={<ForgotEmailPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/practice" element={<PracticePage />} />
                <Route path="/practice/session" element={<PracticeSessionPage />} />
                <Route path="/practice/:id" element={<PracticeSetPage />} />
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
