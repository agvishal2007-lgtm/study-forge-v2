import { useState } from 'react';
import { useWalkthrough } from './walkthrough/Walkthrough';
import { Link } from 'react-router-dom';
import { MaterialList } from '../components/MaterialList';
import { NewCourseForm } from '../components/NewCourseForm';
import { Shelf } from '../components/Shelf';
import { getStorageStatus, listCourses, listMaterials, requestKeepFiles } from '../data/store';
import { getLastBackupAt } from '../data/backup';
import { listCheckpoints, listLessons, listProgress } from '../data/guided';
import { recommendNext } from '../data/mastery';
import { NoteList } from '../components/NoteList';
import { listNotes } from '../data/notes';
import { listUnfinished } from '../data/recordings';
import { useLive } from '../data/useLive';

const BACKUP_REMINDER_MS = 14 * 24 * 60 * 60 * 1000;

export function TodayPage() {
  const { start } = useWalkthrough();
  const [askedToKeep, setAskedToKeep] = useState(false);
  const { data, error } = useLive(async () => {
    const [courses, materials, storage, unfinished, notes, lastBackup] = await Promise.all([listCourses(), listMaterials(), getStorageStatus(), listUnfinished(), listNotes(), getLastBackupAt()]);
    const [lessons, checkpoints, progress] = await Promise.all([listLessons(), listCheckpoints(), listProgress()]);
    return { courses, materials, storage, unfinished, notes, lastBackup, next: recommendNext(lessons, checkpoints, progress) };
  }, [askedToKeep]);

  if (error) return <div className="page"><h1>Today</h1><p className="error" role="alert">Your courses couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { courses, materials, storage, unfinished, notes, lastBackup, next } = data;
  const backupDue = (materials.length > 0 || notes.length > 0) && (lastBackup === null || Date.now() - lastBackup > BACKUP_REMINDER_MS);

  if (courses.length === 0 && materials.length === 0 && unfinished.length === 0 && notes.length === 0) {
    return (
      <div className="page welcome">
        <h1>Start with one course</h1>
        <p>Add a course, then keep its slides, readings, and recordings together. Everything stays in this browser on this device.</p>
        <NewCourseForm />
        <p><button className="text-button" onClick={start}>New here? Take the walkthrough</button></p>
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Today</h1>
      {unfinished.length > 0 && (
        <p className="notice">
          A recording was interrupted, and what was captured is safe. <Link to="/record">Save or discard it</Link>
        </p>
      )}
      {backupDue && (
        <p className="notice" data-testid="backup-reminder">
          {lastBackup === null ? "You haven't backed up yet." : "It's been a while since your last backup."} Your files are only on this device. <Link to="/settings">Create a backup</Link>
        </p>
      )}
      {materials.length > 0 && storage.persisted === false && (
        <p className="notice">
          Your browser may clear saved files if this device runs low on space.{' '}
          <button className="text-button" onClick={async () => { await requestKeepFiles(); setAskedToKeep(true); }}>Ask to keep them</button>
          {askedToKeep && <span> The browser didn't agree yet. It may need you to use the site more or install it.</span>}
        </p>
      )}
      {next && (
        <section aria-labelledby="next-heading" className="next-up" data-testid="next-up">
          <h2 id="next-heading">Study next</h2>
          <p><Link to={`/study/checkpoints/${next.checkpoint.id}`}>{next.checkpoint.title}</Link></p>
          <p className="muted">{next.lesson.title}. {next.reason}</p>
        </section>
      )}
      {courses.length > 0 && (
        <section aria-labelledby="shelf-heading">
          <h2 id="shelf-heading">Your courses</h2>
          <Shelf courses={courses} materials={materials} />
        </section>
      )}
      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading">Recent files</h2>
        {materials.length > 0
          ? <MaterialList materials={materials.slice(0, 6)} courses={courses} />
          : <p className="muted">No files yet. Open a course and add your first one, or use the <Link to="/library">Library</Link>.</p>}
      </section>
      {notes.length > 0 && (
        <section aria-labelledby="recent-notes">
          <h2 id="recent-notes">Recent notes</h2>
          <NoteList notes={notes.slice(0, 4)} courses={courses} />
        </section>
      )}
    </div>
  );
}
