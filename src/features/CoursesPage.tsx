import { NewCourseForm } from '../components/NewCourseForm';
import { Shelf } from '../components/Shelf';
import { listCourses, listMaterials } from '../data/store';
import { useLive } from '../data/useLive';

export function CoursesPage() {
  const { data, error } = useLive(async () => {
    const [courses, materials] = await Promise.all([listCourses(), listMaterials()]);
    return { courses, materials };
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
    </div>
  );
}
