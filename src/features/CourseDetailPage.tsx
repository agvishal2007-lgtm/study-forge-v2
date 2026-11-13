import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AddFiles } from '../components/AddFiles';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { GradesSection } from './GradesSection';
import { CourseTemplateTools } from '../components/CourseTemplates';
import { MaterialList } from '../components/MaterialList';
import { SaveLinkForm } from '../components/SaveLinkForm';
import { NewNoteButton, NoteList } from '../components/NoteList';
import { listNotes } from '../data/notes';
import { useStillHere } from '../components/useStillHere';
import { groupTopics } from '../data/courseRules';
import { createTopic, getCourse, listAllResourceLinks, listTopics, materialsForCourse, moveTopic, setCourseStatus, setTopicStatus, topicWithin, updateCourse, updateTopic } from '../data/store';
import type { Material, Note, Topic } from '../data/types';
import { useLive } from '../data/useLive';

export function CourseDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const stillHere = useStillHere();
  const [topicName, setTopicName] = useState('');
  const [topicHeading, setTopicHeading] = useState('');
  const [editingCourse, setEditingCourse] = useState(false);
  const [failure, setFailure] = useState('');
  const { data, error } = useLive(async () => {
    const [course, topics, archivedTopics, materials, links, notes] = await Promise.all([
      getCourse(id), listTopics(id), listTopics(id, 'archived'), materialsForCourse(id), listAllResourceLinks(), listNotes(),
    ]);
    return {
      course,
      topics,
      archivedTopics,
      // Everything filed here, plus anything also added here from elsewhere.
      materials,
      links,
      notes: notes.filter((note) => note.courseId === id),
    };
  }, [id]);

  if (error) return <div className="page"><p className="error" role="alert">This course couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { course, topics, archivedTopics, materials, links, notes } = data;
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
  const placeOf = (material: Material) => topicWithin(material, links, course.id);
  const loose = materials.filter((material) => !placeOf(material));
  const groups = groupTopics(topics);

  return (
    <div className="page" style={{ '--spine': course.color } as React.CSSProperties}>
      <Breadcrumbs trail={[{ label: 'Courses', to: '/courses' }, { label: course.name }]} />
      <header className="course-head">
        <div>
          <h1>{course.name}</h1>
          {course.code && <p className="muted">{course.code}</p>}
          {course.term && <p className="muted">{course.term}</p>}
          {course.status === 'archived' && <p className="muted">Archived. Everything in it is kept, and it stays searchable.</p>}
        </div>
        <div className="head-actions">
          <button className="text-button" onClick={() => setEditingCourse(!editingCourse)}>{editingCourse ? 'Close' : 'Edit course'}</button>
          {course.status === 'archived'
            ? <button className="button" onClick={() => void attempt(() => setCourseStatus(course.id, 'active'))}>Put back in use</button>
            : <button className="text-button" onClick={() => leave(() => setCourseStatus(course.id, 'archived'))}>Archive course</button>}
          <button className="text-button danger-text" onClick={() => leave(() => setCourseStatus(course.id, 'trashed'))}>Move to Trash</button>
        </div>
      </header>
      {failure && <p className="error" role="alert">{failure}</p>}

      {editingCourse && (
        <form
          className="stack-form"
          data-testid="edit-course"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void attempt(async () => {
              await updateCourse(course.id, {
                name: String(form.get('name') ?? ''),
                code: String(form.get('code') ?? ''),
                term: String(form.get('term') ?? ''),
              });
              setEditingCourse(false);
            });
          }}
        >
          <label>Course name<input name="name" defaultValue={course.name} required /></label>
          <label>Course code<input name="code" defaultValue={course.code} placeholder="ACC 211" /></label>
          <label>
            Semester
            <input name="term" defaultValue={course.term} placeholder="Fall 2026" />
          </label>
          <p className="muted small">Leave the semester empty for an independent study. Courses are grouped by semester on the Courses page.</p>
          <button className="button" type="submit">Save course</button>
        </form>
      )}
      {editingCourse && <CourseTemplateTools courseId={course.id} courseName={course.name} />}

      <section aria-labelledby="course-files">
        <h2 id="course-files">Files</h2>
        <AddFiles courseId={course.id} />
        <details className="link-adder">
          <summary>Save a link for this course</summary>
          <SaveLinkForm courseId={course.id} />
        </details>
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

      <GradesSection courseId={course.id} />

      <section aria-labelledby="course-topics">
        <h2 id="course-topics">Topics</h2>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!topicName.trim()) return;
            void attempt(async () => { await createTopic(course.id, topicName, topicHeading); setTopicName(''); });
          }}
        >
          <label>New topic<input value={topicName} onChange={(event) => setTopicName(event.target.value)} placeholder="The accounting equation" /></label>
          <label>Under heading<input value={topicHeading} onChange={(event) => setTopicHeading(event.target.value)} placeholder="Chapter 1" list="course-headings" /></label>
          <button className="button" type="submit">Add topic</button>
        </form>
        <datalist id="course-headings">
          {[...new Set(topics.map((topic) => topic.heading).filter(Boolean))].map((heading) => <option key={heading} value={heading} />)}
        </datalist>
        <p className="muted small">A heading is yours to name: Chapter 1, Week 3, Unit 2, Module A — whatever your course uses. Leave it empty to keep a topic ungrouped.</p>

        {groups.map((group) => (
          <div key={group.heading || 'ungrouped'} className="topic-group" data-testid={`group-${group.heading || 'ungrouped'}`}>
            {group.heading && <h3 className="topic-heading">{group.heading}</h3>}
            {group.topics.map((topic, index) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                index={index}
                last={index === group.topics.length - 1}
                course={course.id}
                materials={materials}
                placeOf={placeOf}
                notes={notes}
                attempt={attempt}
              />
            ))}
          </div>
        ))}
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

function TopicCard({ topic, index, last, course, materials, placeOf, notes, attempt }: {
  topic: Topic;
  index: number;
  last: boolean;
  course: string;
  materials: Material[];
  placeOf: (material: Material) => string | null;
  notes: Note[];
  attempt: (action: () => Promise<void>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const files = materials.filter((material) => placeOf(material) === topic.id);
  return (
    <article className="topic">
      <header>
        <h4>{topic.name}</h4>
        <span className="head-actions">
          <button className="text-button" disabled={index === 0} onClick={() => void attempt(() => moveTopic(topic.id, 'up'))} aria-label={`Move topic ${topic.name} up`}>Up</button>
          <button className="text-button" disabled={last} onClick={() => void attempt(() => moveTopic(topic.id, 'down'))} aria-label={`Move topic ${topic.name} down`}>Down</button>
          <button className="text-button" onClick={() => setEditing(!editing)} aria-label={`Rename topic ${topic.name}`}>{editing ? 'Close' : 'Rename'}</button>
          <button className="text-button" onClick={() => void attempt(() => setTopicStatus(topic.id, 'archived'))} aria-label={`Archive topic ${topic.name}`}>Archive</button>
          <button className="text-button danger-text" onClick={() => void attempt(() => setTopicStatus(topic.id, 'trashed'))} aria-label={`Move topic ${topic.name} to Trash`}>Move to Trash</button>
        </span>
      </header>
      {editing && (
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void attempt(async () => {
              await updateTopic(topic.id, { name: String(form.get('name') ?? ''), heading: String(form.get('heading') ?? '') });
              setEditing(false);
            });
          }}
        >
          <label>Topic name<input name="name" defaultValue={topic.name} required /></label>
          <label>Under heading<input name="heading" defaultValue={topic.heading} placeholder="Chapter 1" list="course-headings" /></label>
          <button className="button" type="submit">Save topic</button>
        </form>
      )}
      <AddFiles courseId={course} topicId={topic.id} />
      {files.length > 0 && <MaterialList materials={files} />}
      <div className="topic-note"><NewNoteButton courseId={course} topicId={topic.id} label="New note for this topic" /></div>
      {notes.some((note) => note.topicId === topic.id) && <NoteList notes={notes.filter((note) => note.topicId === topic.id)} />}
    </article>
  );
}
