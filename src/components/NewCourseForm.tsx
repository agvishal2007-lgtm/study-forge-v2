import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCourse } from '../data/store';
import { applyTemplate } from '../data/courseTemplates';
import type { CourseTemplate } from '../data/courseTemplateRules';
import { TemplatePicker } from './CourseTemplates';
import { useStillHere } from './useStillHere';
import { useSchool, useSchoolWords } from '../data/schoolLevel';

export function NewCourseForm() {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<{ id: string; template: CourseTemplate | null }>({ id: '', template: null });
  const [allYear, setAllYear] = useState(false);
  const school = useSchool();
  const words = useSchoolWords();
  // Only worth asking when the year is split up. If the whole year is one term, every class is
  // an all-year class already and a tick box saying so would mean nothing.
  const yearIsSplit = school.termKind !== 'year';
  const navigate = useNavigate();
  const stillHere = useStillHere();
  return (
    <form
      className="inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return setError(`Enter a ${words.course} name.`);
        try {
          const course = await createCourse(name, code, '', { allYear: yearIsSplit && allYear });
          if (picked.template) await applyTemplate(course.id, picked.template);
          if (stillHere.current) navigate(`/courses/${course.id}`);
        } catch (failure) {
          setError(`The course wasn't saved. ${(failure as Error).message}`);
        }
      }}
    >
      <label>{words.Course} name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Financial Accounting" /></label>
      <label>{words.Course} code (optional)<input value={code} onChange={(event) => setCode(event.target.value)} placeholder="ACC 211" /></label>
      {yearIsSplit && (
        <label className="choice-pair">
          <input type="checkbox" checked={allYear} data-testid="all-year" onChange={(event) => setAllYear(event.target.checked)} />
          This {words.course} runs all year, not just one {words.term}
        </label>
      )}
      <TemplatePicker value={picked.id} onChange={(id, template) => setPicked({ id, template })} />
      <button className="button primary" type="submit">Create {words.course}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
