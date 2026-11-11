import { Link } from 'react-router-dom';
import { NewCourseForm } from '../components/NewCourseForm';
import { Shelf } from '../components/Shelf';
import { listCourses, listMaterials, setCourseStatus } from '../data/store';
import { useLive } from '../data/useLive';

export function CoursesPage() {
  const { data, error } = useLive(async () => {
    const [courses, archived, materials] = await Promise.all([listCourses(), listCourses('archived'), listMaterials()]);
    return { courses, archived, materials };
  });
  return (
    <div className="page">
      <h1>Courses</h1>
      {error && <p className="error" role="alert">Your courses couldn't be loaded. {error.message}</p>}
      {data && data.courses.length > 0 && <Shelf courses={data.courses} materials={data.materials} />}
      <section aria-labelledby="add-course" data-tour="add-course">
        <h2 id="add-course">Add a course</h2>
        <NewCourseForm />
      </section>
      {data && data.archived.length > 0 && (
        <section aria-labelledby="archived-courses" data-testid="archived-courses">
          <h2 id="archived-courses">Archived courses</h2>
          <p className="muted">Finished courses, kept whole. Their files, notes and results are still here and still searchable.</p>
          <ul className="plain-list">
            {data.archived.map((course) => (
              <li key={course.id}>
                <Link to={`/courses/${course.id}`}>{course.name}</Link>
                {course.code && <span className="muted"> {course.code}</span>}
                <button className="text-button" onClick={() => void setCourseStatus(course.id, 'active')} aria-label={`Put ${course.name} back in use`}>Put back in use</button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted small"><Link to="/bin">Open the bin</Link> to restore anything you moved there, or remove it for good.</p>
    </div>
  );
}
