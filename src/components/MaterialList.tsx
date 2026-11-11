import { Link } from 'react-router-dom';
import { formatBytes, formatDate, KIND_LABEL, kindOf } from '../data/format';
import { LINK_CATEGORY_LABEL, siteOf } from '../data/linkRules';
import type { Course, Material } from '../data/types';

interface Props {
  materials: Material[];
  courses?: Course[];
}

export function MaterialList({ materials, courses }: Props) {
  return (
    <ul className="files">
      {materials.map((material) => {
        const course = courses?.find((candidate) => candidate.id === material.courseId);
        return (
          <li key={material.id} style={{ '--spine': course?.color ?? 'var(--line)' } as React.CSSProperties}>
            <Link to={`/files/${material.id}`}>{material.name}</Link>
            <span className="muted file-meta">
              {(material.kind === 'link'
                ? ['Link', LINK_CATEGORY_LABEL[material.category], siteOf(material.url), formatDate(material.createdAt), courses && (course?.name ?? 'No course')]
                : [KIND_LABEL[kindOf(material)], formatBytes(material.size), formatDate(material.createdAt), courses && (course?.name ?? 'No course')]
              ).filter(Boolean).join(', ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
