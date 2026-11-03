import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { RecorderProvider, RecordingBar } from './components/Recorder';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SaveProvider, SavePanel } from './components/SaveQueue';
import { CourseDetailPage } from './features/CourseDetailPage';
import { CoursesPage } from './features/CoursesPage';
import { LibraryPage } from './features/LibraryPage';
import { RecordPage } from './features/RecordPage';
import { SettingsPage } from './features/SettingsPage';
import { TodayPage } from './features/TodayPage';

// The viewer loads the PDF reader, so it only downloads when a file is opened.
const ViewerPage = lazy(() => import('./features/ViewerPage'));

const MAIN_LINKS = [
  { to: '/', label: 'Today', end: true },
  { to: '/courses', label: 'Courses', end: false },
  { to: '/library', label: 'Library', end: false },
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
          <div className="nav-bottom">
            <NavLink to="/settings">Settings</NavLink>
          </div>
        </nav>
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
                <Route path="/record" element={<RecordPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        <SavePanel />
      </div>
    </RecorderProvider>
    </SaveProvider>
  );
}
