import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCourse } from '../data/store';
import { applyTemplate } from '../data/courseTemplates';
import type { CourseTemplate } from '../data/courseTemplateRules';
import { TemplatePicker } from './CourseTemplates';
import { useStillHere } from './useStillHere';

export function NewCourseForm() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<{ id: string; template: CourseTemplate | null }>({ id: '', template: null });
  const navigate = useNavigate();
  const stillHere = useStillHere();
  return (
    <form
      className="inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return setError('Enter a course name.');
        try {
          const course = await createCourse(name, code);
          if (picked.template) await applyTemplate(course.id, picked.template);
          if (stillHere.current) navigate(`/courses/${course.id}`);
        } catch (failure) {
          setError(`The course wasn't saved. ${(failure as Error).message}`);
        }
      }}
    >
      <label>Course name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Financial Accounting" /></label>
      <label>Course code (optional)<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="ACC 211" /></label>
      <TemplatePicker value={picked.id} onChange={(id, template) => setPicked({ id, template })} />
      <button className="button primary" type="submit">Create course</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
