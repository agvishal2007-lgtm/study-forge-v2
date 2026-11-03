import { useState } from 'react';
import { AddFiles } from '../components/AddFiles';
import { MaterialList } from '../components/MaterialList';
import { listCourses, listMaterials } from '../data/store';
import { useLive } from '../data/useLive';

export function LibraryPage() {
  const [query, setQuery] = useState('');
  const { data, error } = useLive(async () => {
    const [courses, materials] = await Promise.all([listCourses(), listMaterials()]);
    return { courses, materials };
  });
  const shown = data?.materials.filter((material) => material.name.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return (
    <div className="page">
      <h1>Library</h1>
      <p className="muted">Every file you've saved, across all your courses.</p>
      <AddFiles />
      {error && <p className="error" role="alert">Your files couldn't be loaded. {error.message}</p>}
      {data && data.materials.length > 0 && (
        <label className="search">Find a file by name<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      )}
      {data && (shown.length > 0
        ? <MaterialList materials={shown} courses={data.courses} />
        : <p className="muted">{data.materials.length ? 'No file names match that search.' : 'No files yet. Add one above.'}</p>)}
    </div>
  );
}
