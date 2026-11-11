import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { listCards, listDecks } from '../data/flashcards';
import { listFileText, readNewFiles } from '../data/fileText';
import { listTranscripts } from '../data/transcripts';
import { listCheckpoints, listLessons } from '../data/guided';
import { listNotes } from '../data/notes';
import { plainNote } from '../data/noteFormat';
import { listCalendarEvents } from '../data/calendar';
import { listPlannerItems } from '../data/planner';
import { listPracticeQuestions, listPracticeSets } from '../data/practice';
import { highlight, runSearch, searchTerms, type Searchable } from '../data/searchRules';
import { listAllCourses, listMaterials } from '../data/store';
import { useLive } from '../data/useLive';

const MAX_SHOWN = 30;

async function loadSearchable(): Promise<{ items: Searchable[]; scanned: number; materials: Awaited<ReturnType<typeof listMaterials>> }> {
  const [notes, materials, fileText, decks, cards, sets, questions, planner, lessons, checkpoints, courses, calendar, transcripts] = await Promise.all([
    listNotes(), listMaterials(), listFileText(), listDecks(), listCards(), listPracticeSets(), listPracticeQuestions(), listPlannerItems(), listLessons(), listCheckpoints(), listAllCourses(), listCalendarEvents(), listTranscripts(),
  ]);
  const items: Searchable[] = [];
  for (const note of notes) items.push({ group: 'Notes', title: note.title || 'Untitled note', body: plainNote(note.body), to: `/notes/${note.id}` });
  const read = new Map(fileText.map((entry) => [entry.materialId, entry]));
  for (const material of materials) {
    // A saved link is findable by its address as well as its name.
    items.push({ group: 'Files', title: material.name, body: material.kind === 'link' ? material.url : '', to: `/files/${material.id}` });
    read.get(material.id)?.pages.forEach((page, index, pages) => {
      if (page.trim()) items.push({ group: 'Files', title: material.name, body: page, to: `/files/${material.id}${pages.length > 1 ? `?page=${index + 1}` : ''}`, detail: pages.length > 1 ? `Page ${index + 1}` : undefined });
    });
  }
  const materialNames = new Map(materials.map((material) => [material.id, material.name]));
  for (const transcript of transcripts) {
    if (transcript.text.trim()) items.push({ group: 'Files', title: materialNames.get(transcript.materialId) ?? 'Recording', body: transcript.text, to: `/files/${transcript.materialId}`, detail: 'Transcript' });
  }
  const deckNames = new Map(decks.map((deck) => [deck.id, deck.name]));
  for (const deck of decks) items.push({ group: 'Flashcards', title: deck.name, body: '', to: `/cards/${deck.id}`, detail: 'Deck' });
  for (const card of cards) items.push({ group: 'Flashcards', title: card.front, body: card.back, to: `/cards/${card.deckId}`, detail: deckNames.get(card.deckId) });
  const setNames = new Map(sets.map((set) => [set.id, set.name]));
  for (const set of sets) items.push({ group: 'Practice', title: set.name, body: '', to: `/practice/${set.id}`, detail: 'Set' });
  for (const question of questions) {
    items.push({ group: 'Practice', title: question.prompt, body: [question.topic, question.modelAnswer, question.explanation, question.source, ...question.options].filter(Boolean).join(' '), to: `/practice/${question.setId}`, detail: setNames.get(question.setId) });
  }
  for (const item of planner) items.push({ group: 'Planner', title: item.title, body: item.details, to: `/planner/${item.id}`, detail: item.type });
  // A class that meets 45 times shows up once.
  const shownSeries = new Set<string>();
  for (const event of calendar.filter((entry) => !entry.hidden && (!entry.seriesId || !shownSeries.has(entry.seriesId) && shownSeries.add(entry.seriesId)))) items.push({ group: 'Calendar', title: event.title, body: [event.details?.place ?? event.location, event.whatToDo, event.details?.notes].filter(Boolean).join(' '), to: `/calendar/event/${event.id}`, detail: event.date });
  for (const lesson of lessons) items.push({ group: 'Lessons', title: lesson.title, body: '', to: `/study/lessons/${lesson.id}`, detail: 'Lesson' });
  for (const checkpoint of checkpoints) {
    const teaching = checkpoint.teaching;
    items.push({ group: 'Lessons', title: checkpoint.title, body: [teaching.intro, teaching.meaning, teaching.why, teaching.example, teaching.keyIdea, ...checkpoint.keyPoints].filter(Boolean).join(' '), to: `/study/checkpoints/${checkpoint.id}` });
  }
  for (const course of courses) items.push({ group: 'Courses', title: course.name, body: course.code, to: `/courses/${course.id}` });
  return { items, materials, scanned: fileText.filter((entry) => entry.status === 'no-text').length };
}

function Marked({ text, terms }: { text: string; terms: string[] }) {
  return <>{highlight(text, terms).map((piece, index) => (piece.match ? <mark key={index}>{piece.text}</mark> : <span key={index}>{piece.text}</span>))}</>;
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [version, setVersion] = useState(0);
  const { data, error } = useLive(loadSearchable, [version]);
  const reading = useRef(false);
  const materialIds = data?.materials.map((material) => material.id).join();

  // Reads any new files the first time they're needed, without stopping the student from searching.
  useEffect(() => {
    if (!data || reading.current) return undefined;
    let active = true;
    reading.current = true;
    void readNewFiles(data.materials, () => active, (done, total) => { if (active) setProgress({ done, total }); })
      .then(() => { if (active) setVersion((value) => value + 1); })
      .catch(() => undefined)
      .finally(() => { reading.current = false; });
    return () => { active = false; };
    // Only runs again when the list of files changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialIds]);

  useEffect(() => {
    const timer = setTimeout(() => {
      // The student may have just opened a result, and this must not pull them back.
      if (window.location.hash.startsWith('#/search')) setParams(query.trim() ? { q: query } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const groups = useMemo(() => runSearch(data?.items ?? [], query), [data, query]);
  const terms = searchTerms(query);
  const total = groups.reduce((sum, group) => sum + group.hits.length, 0);
  if (error) return <div className="page"><h1>Search</h1><p className="error" role="alert">Search couldn't load. {error.message}</p></div>;

  return (
    <div className="page search-page">
      <h1>Search</h1>
      <label className="search" data-tour="search-box">Search everything
        <input type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Accruals, chapter 3, midterm…" />
      </label>
      {progress && progress.done < progress.total && <p className="muted file-meta" role="status" data-testid="search-reading">Reading your files so they can be searched: {progress.done} of {progress.total}. You can search while this finishes.</p>}
      {(data?.scanned ?? 0) > 0 && <p className="muted file-meta" data-testid="search-scanned">{data?.scanned} {data?.scanned === 1 ? 'file has' : 'files have'} no readable words, such as a blurry scan or a photo of a diagram, so only {data?.scanned === 1 ? 'its name' : 'their names'} can be searched.</p>}
      {terms.length === 0 && <p className="muted">Search your notes, files, flashcards, practice questions, planner, lessons, and courses, including words inside PDFs, Office files, scanned pages, and images. It all happens on this device.</p>}
      {terms.length > 0 && data && total === 0 && <p data-testid="search-empty">Nothing found for "{query.trim()}". Try fewer or different words.</p>}
      {terms.length > 0 && total > 0 && <p className="muted" data-testid="search-count" role="status">{total} {total === 1 ? 'result' : 'results'}</p>}
      {groups.map(({ group, hits }) => (
        <section key={group} className="search-group" aria-label={group} data-testid={`search-${group}`}>
          <h2>{group} <span className="muted planner-count">({hits.length})</span></h2>
          <ul className="planner-list">
            {hits.slice(0, MAX_SHOWN).map((hit, index) => (
              <li key={`${hit.to}-${index}`} className="planner-row">
                <div className="planner-main">
                  <Link to={hit.to}><Marked text={hit.title} terms={terms} /></Link>
                  {hit.detail && <span className="muted file-meta">{hit.detail}</span>}
                  {hit.snippet && <span className="search-snippet"><Marked text={hit.snippet} terms={terms} /></span>}
                </div>
              </li>
            ))}
          </ul>
          {hits.length > MAX_SHOWN && <p className="muted">Showing the first {MAX_SHOWN}. Add another word to narrow it down.</p>}
        </section>
      ))}
    </div>
  );
}
