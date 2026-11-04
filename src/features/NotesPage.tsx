import { useState } from 'react';
import { NewNoteButton, NoteList } from '../components/NoteList';
import { listNotes, noteLabel } from '../data/notes';
import { listCourses } from '../data/store';
import { useLive } from '../data/useLive';

export function NotesPage() {
  const [query, setQuery] = useState('');
  const { data, error } = useLive(async () => {
    const [notes, courses] = await Promise.all([listNotes(), listCourses()]);
    return { notes, courses };
  });
  const search = query.trim().toLowerCase();
  const shown = data?.notes.filter((note) => `${noteLabel(note)}\n${note.body}`.toLowerCase().includes(search)) ?? [];
  return (
    <div className="page">
      <h1>Notes</h1>
      <p className="muted">Everything you've written, across all your courses.</p>
      <div data-tour="new-note" className="tour-inline"><NewNoteButton primary /></div>
      {error && <p className="error" role="alert">Your notes couldn't be loaded. {error.message}</p>}
      {data && data.notes.length > 0 && (
        <label className="search">Search your notes<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      )}
      {data && (shown.length > 0
        ? <NoteList notes={shown} courses={data.courses} />
        : <p className="muted">{data.notes.length ? 'No notes match that search.' : 'No notes yet. Your notes will appear here.'}</p>)}
    </div>
  );
}
