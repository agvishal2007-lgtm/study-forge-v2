import { useState } from 'react';
import { AddFiles } from '../components/AddFiles';
import { MaterialList } from '../components/MaterialList';
import { SaveLinkForm } from '../components/SaveLinkForm';
import { listAllCourses, listMaterials } from '../data/store';
import { useLive } from '../data/useLive';

export function LibraryPage() {
  const [query, setQuery] = useState('');
  const { data, error } = useLive(async () => {
    const [courses, materials] = await Promise.all([listAllCourses(), listMaterials()]);
    return { courses, materials };
  });
  const needle = query.trim().toLowerCase();
  const shown = data?.materials.filter((material) =>
    material.name.toLowerCase().includes(needle) || material.url.toLowerCase().includes(needle)) ?? [];
  return (
    <div className="page">
      <h1>Library</h1>
      <p className="muted">Every file and saved link, across all your courses.</p>
      <AddFiles />
      <details className="link-adder">
        <summary>Save a link instead</summary>
        <SaveLinkForm />
      </details>
      {error && <p className="error" role="alert">Your files couldn't be loaded. {error.message}</p>}
      {data && data.materials.length > 0 && (
        <label className="search">Find a file or link<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      )}
      {data && (shown.length > 0
        ? <MaterialList materials={shown} courses={data.courses} />
        : <p className="muted">{data.materials.length ? 'Nothing matches that search.' : 'Nothing here yet. Add a file or save a link above.'}</p>)}
    </div>
  );
}
