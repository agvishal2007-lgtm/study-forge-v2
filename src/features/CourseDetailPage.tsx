import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AddFiles } from '../components/AddFiles';
import { MaterialList } from '../components/MaterialList';
import { NewNoteButton, NoteList } from '../components/NoteList';
import { listNotes } from '../data/notes';
import { useStillHere } from '../components/useStillHere';
import { createTopic, getCourse, listMaterials, listTopics, setCourseStatus, setTopicStatus } from '../data/store';
import { useLive } from '../data/useLive';

export function CourseDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const stillHere = useStillHere();
  const [topicName, setTopicName] = useState('');
  const [failure, setFailure] = useState('');
  const { data, error } = useLive(async () => {
    const [course, topics, archivedTopics, materials, notes] = await Promise.all([
      getCourse(id), listTopics(id), listTopics(id, 'archived'), listMaterials(), listNotes(),
    ]);
    return {
      course,
      topics,
      archivedTopics,
      materials: materials.filter((material) => material.courseId === id),
      notes: notes.filter((note) => note.courseId === id),
    };
  }, [id]);

  if (error) return <div className="page"><p className="error" role="alert">This course couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { course, topics, archivedTopics, materials, notes } = data;
  if (!course) return <div className="page"><h1>This course doesn't exist</h1><Link to="/courses">Go to Courses</Link></div>;

  const attempt = async (action: () => Promise<void>) => {
    setFailure('');
    try {
      await action();
    } catch (problem) {
      setFailure(`That didn't work. ${(problem as Error).message}`);
    }
  };
  const leave = (action: () => Promise<void>) => void attempt(async () => {
    await action();
    if (stillHere.current) navigate('/courses', { replace: true });
  });
  const loose = materials.filter((material) => !material.topicId);

  return (
    <div className="page" style={{ '--spine': course.color } as React.CSSProperties}>
      <header className="course-head">
        <div>
          <h1>{course.name}</h1>
          {course.code && <p className="muted">{course.code}</p>}
          {course.status === 'archived' && <p className="muted">Archived. Everything in it is kept, and it stays searchable.</p>}
        </div>
        <div className="head-actions">
          {course.status === 'archived'
            ? <button className="button" onClick={() => void attempt(() => setCourseStatus(course.id, 'active'))}>Put back in use</button>
            : <button className="text-button" onClick={() => leave(() => setCourseStatus(course.id, 'archived'))}>Archive course</button>}
          <button className="text-button danger-text" onClick={() => leave(() => setCourseStatus(course.id, 'trashed'))}>Move to bin</button>
        </div>
      </header>
      <p className="muted small">Archiving keeps a finished course whole and searchable. The bin holds it until you restore it or remove it for good. Neither one deletes your files.</p>
      {failure && <p className="error" role="alert">{failure}</p>}

      <section aria-labelledby="course-files">
        <h2 id="course-files">Files</h2>
        <AddFiles courseId={course.id} />
        <p><Link to={`/record?course=${course.id}`}>Record a lecture for this course</Link></p>
        <p><Link to={`/study?course=${course.id}`}>Study this course</Link></p>
        <p><Link to={`/planner?course=${course.id}`}>Assignments and exams for this course</Link></p>
        <p><Link to={`/cards?course=${course.id}`}>Flashcards for this course</Link></p>
        <p><Link to={`/practice?course=${course.id}`}>Practice for this course</Link></p>
        {loose.length > 0
          ? <MaterialList materials={loose} />
          : topics.length === 0 && <p className="muted">No files in this course yet.</p>}
      </section>

      <section aria-labelledby="course-notes">
        <h2 id="course-notes">Notes</h2>
        <NewNoteButton courseId={course.id} />
        {notes.some((note) => !note.topicId)
          ? <NoteList notes={notes.filter((note) => !note.topicId)} />
          : notes.length === 0 && <p className="muted">No notes in this course yet.</p>}
      </section>

      <section aria-labelledby="course-topics">
        <h2 id="course-topics">Topics</h2>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!topicName.trim()) return;
            void attempt(async () => { await createTopic(course.id, topicName); setTopicName(''); });
          }}
        >
          <label>New topic<input value={topicName} onChange={(event) => setTopicName(event.target.value)} placeholder="Chapter 1: The accounting equation" /></label>
          <button className="button" type="submit">Add topic</button>
        </form>
        {topics.map((topic) => {
          const files = materials.filter((material) => material.topicId === topic.id);
          return (
            <article className="topic" key={topic.id}>
              <header>
                <h3>{topic.name}</h3>
                <span className="head-actions">
                  <button className="text-button" onClick={() => void attempt(() => setTopicStatus(topic.id, 'archived'))} aria-label={`Archive topic ${topic.name}`}>Archive</button>
                  <button className="text-button danger-text" onClick={() => void attempt(() => setTopicStatus(topic.id, 'trashed'))} aria-label={`Move topic ${topic.name} to the bin`}>Move to bin</button>
                </span>
              </header>
              <AddFiles courseId={course.id} topicId={topic.id} />
              {files.length > 0 && <MaterialList materials={files} />}
              <div className="topic-note"><NewNoteButton courseId={course.id} topicId={topic.id} label="New note for this topic" /></div>
              {notes.some((note) => note.topicId === topic.id) && <NoteList notes={notes.filter((note) => note.topicId === topic.id)} />}
            </article>
          );
        })}
      </section>

      {archivedTopics.length > 0 && (
        <section aria-labelledby="archived-topics" data-testid="archived-topics">
          <h2 id="archived-topics">Archived topics</h2>
          <p className="muted">Put away but kept. Their files and notes are still in this course.</p>
          <ul className="plain-list">
            {archivedTopics.map((topic) => (
              <li key={topic.id}>
                {topic.name}
                <button className="text-button" onClick={() => void attempt(() => setTopicStatus(topic.id, 'active'))} aria-label={`Put topic ${topic.name} back in use`}>Put back in use</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
