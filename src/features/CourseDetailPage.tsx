import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AddFiles } from '../components/AddFiles';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { MaterialList } from '../components/MaterialList';
import { useStillHere } from '../components/useStillHere';
import { createTopic, deleteCourse, deleteTopic, getCourse, listMaterials, listTopics } from '../data/store';
import type { Topic } from '../data/types';
import { useLive } from '../data/useLive';

export function CourseDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const stillHere = useStillHere();
  const [topicName, setTopicName] = useState('');
  const [confirmCourse, setConfirmCourse] = useState(false);
  const [confirmTopic, setConfirmTopic] = useState<Topic | null>(null);
  const [failure, setFailure] = useState('');
  const { data, error } = useLive(async () => {
    const [course, topics, materials] = await Promise.all([getCourse(id), listTopics(id), listMaterials()]);
    return { course, topics, materials: materials.filter((material) => material.courseId === id) };
  }, [id]);

  if (error) return <div className="page"><p className="error" role="alert">This course couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { course, topics, materials } = data;
  if (!course) return <div className="page"><h1>This course doesn't exist</h1><Link to="/courses">Go to Courses</Link></div>;

  const attempt = async (action: () => Promise<void>) => {
    setFailure('');
    try {
      await action();
    } catch (problem) {
      setFailure(`That didn't work. ${(problem as Error).message}`);
    }
  };
  const loose = materials.filter((material) => !material.topicId);

  return (
    <div className="page" style={{ '--spine': course.color } as React.CSSProperties}>
      <header className="course-head">
        <div>
          <h1>{course.name}</h1>
          {course.code && <p className="muted">{course.code}</p>}
        </div>
        <button className="text-button danger-text" onClick={() => setConfirmCourse(true)}>Delete course</button>
      </header>
      {failure && <p className="error" role="alert">{failure}</p>}

      <section aria-labelledby="course-files">
        <h2 id="course-files">Files</h2>
        <AddFiles courseId={course.id} />
        <p><Link to={`/record?course=${course.id}`}>Record a lecture for this course</Link></p>
        {loose.length > 0
          ? <MaterialList materials={loose} />
          : topics.length === 0 && <p className="muted">No files in this course yet.</p>}
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
                <button className="text-button danger-text" onClick={() => setConfirmTopic(topic)} aria-label={`Delete topic ${topic.name}`}>Delete topic</button>
              </header>
              <AddFiles courseId={course.id} topicId={topic.id} />
              {files.length > 0 && <MaterialList materials={files} />}
            </article>
          );
        })}
      </section>

      {confirmCourse && (
        <ConfirmDialog
          title={`Delete ${course.name}?`}
          confirmLabel="Delete course"
          onCancel={() => setConfirmCourse(false)}
          onConfirm={() => void attempt(async () => { await deleteCourse(course.id); if (stillHere.current) navigate('/courses', { replace: true }); })}
        >
          <p>The course and its topics will be removed. Its {materials.length === 1 ? '1 file stays' : `${materials.length} files stay`} in your Library.</p>
        </ConfirmDialog>
      )}
      {confirmTopic && (
        <ConfirmDialog
          title={`Delete ${confirmTopic.name}?`}
          confirmLabel="Delete topic"
          onCancel={() => setConfirmTopic(null)}
          onConfirm={() => void attempt(async () => { await deleteTopic(confirmTopic.id); setConfirmTopic(null); })}
        >
          <p>The topic will be removed. Its files stay in this course.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
