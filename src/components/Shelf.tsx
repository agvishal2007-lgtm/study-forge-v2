import { Link } from 'react-router-dom';
import type { Course, Material } from '../data/types';

/** The shelf is the app's signature: each book gets wider as its course holds more files. */
export function Shelf({ courses, materials }: { courses: Course[]; materials: Material[] }) {
  return (
    <div className="shelf">
      {courses.map((course) => {
        const count = materials.filter((material) => material.courseId === course.id).length;
        return (
          <Link
            key={course.id}
            to={`/courses/${course.id}`}
            className="book"
            style={{ '--spine': course.color, '--extra': `${Math.min(count, 12) * 7}px` } as React.CSSProperties}
          >
            <span className="book-title">{course.name}</span>
            {course.code && <span className="book-code">{course.code}</span>}
            <span className="book-count">{count === 1 ? '1 file' : `${count} files`}</span>
          </Link>
        );
      })}
    </div>
  );
}
