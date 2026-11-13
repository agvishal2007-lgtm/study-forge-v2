import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CourseSetup } from '../components/CourseSetup';
import { useSchoolProfile } from '../data/schoolProfile';
import { NewCourseForm } from '../components/NewCourseForm';
import { MyTemplates } from '../components/CourseTemplates';
import { Shelf } from '../components/Shelf';
import { groupCourses } from '../data/courseRules';
import { listCourses, listMaterials, moveCourse, setCourseStatus } from '../data/store';
import { useLive } from '../data/useLive';

export function CoursesPage() {
  const [arranging, setArranging] = useState(false);
  const school = useSchoolProfile();
  const { data, error } = useLive(async () => {
    const [courses, archived, materials] = await Promise.all([listCourses(), listCourses('archived'), listMaterials()]);
    return { courses, archived, materials };
  });

  const groups = data ? groupCourses(data.courses) : [];
  // A student who never sets a term shouldn't see a heading for one.
  const showTerms = groups.length > 1 || Boolean(groups[0]?.term);

  return (
    <div className="page">
      <div className="section-head">
        <h1>Courses</h1>
        {school.level !== 'elementary' && <Link className="button" to="/courses/new-semester" data-testid="new-semester">Start a new semester</Link>}
      </div>
      {data && <CourseSetup hasCourses={data.courses.length > 0 || data.archived.length > 0} />}
      {error && <p className="error" role="alert">Your courses couldn't be loaded. {error.message}</p>}
      {data && data.courses.length > 1 && (
        <p>
          <button className="text-button" onClick={() => setArranging(!arranging)} data-testid="arrange-toggle">
            {arranging ? 'Done arranging' : 'Arrange courses'}
          </button>
          {arranging && <span className="muted small"> Courses move within their own semester.</span>}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.term || 'no-term'} className="course-group" aria-label={group.term || 'Courses with no semester'}>
          {showTerms && <h2>{group.term || 'No semester'}</h2>}
          {arranging
            ? (
              <ol className="arrange-list" data-testid={`arrange-${group.term || 'no-term'}`}>
                {group.courses.map((course, index) => (
                  <li key={course.id}>
                    <span className="arrange-name">{course.name}</span>
                    <span className="head-actions">
                      <button
                        className="text-button"
                        disabled={index === 0}
                        onClick={() => void moveCourse(course.id, 'up')}
                        aria-label={`Move ${course.name} earlier`}
                      >
                        Move earlier
                      </button>
                      <button
                        className="text-button"
                        disabled={index === group.courses.length - 1}
                        onClick={() => void moveCourse(course.id, 'down')}
                        aria-label={`Move ${course.name} later`}
                      >
                        Move later
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )
            : <Shelf courses={group.courses} materials={data?.materials ?? []} />}
        </section>
      ))}

      <section aria-labelledby="add-course" data-tour="add-course">
        <h2 id="add-course">{school.level === 'elementary' ? 'Add a subject' : 'Add a course'}</h2>
        <NewCourseForm />
      </section>

      {school.level !== 'elementary' && <MyTemplates />}

      {data && data.archived.length > 0 && (
        <section aria-labelledby="archived-courses" data-testid="archived-courses">
          <h2 id="archived-courses">Archived courses</h2>
          <p className="muted">Finished courses, kept whole. Their files, notes and results are still here and still searchable.</p>
          <ul className="plain-list">
            {data.archived.map((course) => (
              <li key={course.id}>
                <Link to={`/courses/${course.id}`}>{course.name}</Link>
                {course.term && <span className="muted"> {course.term}</span>}
                <button className="text-button" onClick={() => void setCourseStatus(course.id, 'active')} aria-label={`Put ${course.name} back in use`}>Put back in use</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
