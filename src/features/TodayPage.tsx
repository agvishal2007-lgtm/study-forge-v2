import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MaterialList } from '../components/MaterialList';
import { NewCourseForm } from '../components/NewCourseForm';
import { Shelf } from '../components/Shelf';
import { getStorageStatus, listCourses, listMaterials, requestKeepFiles } from '../data/store';
import { useLive } from '../data/useLive';

export function TodayPage() {
  const [askedToKeep, setAskedToKeep] = useState(false);
  const { data, error } = useLive(async () => {
    const [courses, materials, storage] = await Promise.all([listCourses(), listMaterials(), getStorageStatus()]);
    return { courses, materials, storage };
  }, [askedToKeep]);

  if (error) return <div className="page"><h1>Today</h1><p className="error" role="alert">Your courses couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { courses, materials, storage } = data;

  if (courses.length === 0 && materials.length === 0) {
    return (
      <div className="page welcome">
        <h1>Start with one course</h1>
        <p>Add a course, then keep its slides, readings, and recordings together. Everything stays in this browser on this device.</p>
        <NewCourseForm />
      </div>
    );
  }

  return (
    <div className="page">
      <h1>Today</h1>
      {materials.length > 0 && storage.persisted === false && (
        <p className="notice">
          Your browser may clear saved files if this device runs low on space.{' '}
          <button className="text-button" onClick={async () => { await requestKeepFiles(); setAskedToKeep(true); }}>Ask to keep them</button>
          {askedToKeep && <span> The browser didn't agree yet. It may need you to use the site more or install it.</span>}
        </p>
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
    </div>
  );
}
