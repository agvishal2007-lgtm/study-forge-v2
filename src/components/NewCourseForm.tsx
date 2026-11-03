import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCourse } from '../data/store';

export function NewCourseForm() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  return (
    <form
      className="inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return setError('Enter a course name.');
        try {
          const course = await createCourse(name, code);
          navigate(`/courses/${course.id}`);
        } catch (failure) {
          setError(`The course wasn't saved. ${(failure as Error).message}`);
        }
      }}
    >
      <label>Course name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Financial Accounting" /></label>
      <label>Course code (optional)<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="ACC 211" /></label>
      <button className="button primary" type="submit">Create course</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
