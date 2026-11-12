import { Link } from 'react-router-dom';
import { formatBytes, formatDate, KIND_LABEL, kindOf } from '../data/format';
import { LINK_CATEGORY_LABEL, siteOf } from '../data/linkRules';
import type { Course, Material } from '../data/types';

interface Props {
  materials: Material[];
  courses?: Course[];
  /** When given, each row gets a checkbox so several can be acted on at once. */
  selected?: Set<string>;
  onToggle?: (id: string) => void;
}

export function MaterialList({ materials, courses, selected, onToggle }: Props) {
  return (
    <ul className="files">
      {materials.map((material) => {
        const course = courses?.find((candidate) => candidate.id === material.courseId);
        return (
          <li key={material.id} className={selected ? 'selectable' : undefined} style={{ '--spine': course?.color ?? 'var(--line)' } as React.CSSProperties}>
            {selected && onToggle && (
              <input
                type="checkbox"
                className="row-check"
                aria-label={`Select ${material.name}`}
                checked={selected.has(material.id)}
                onChange={() => onToggle(material.id)}
              />
            )}
            <span className="row-main">
            <Link to={`/files/${material.id}`}>{material.pinnedAt ? <span className="pin-mark">Pinned · </span> : null}{material.name}</Link>
            <span className="muted file-meta">
              {(material.kind === 'link'
                ? ['Link', LINK_CATEGORY_LABEL[material.category], siteOf(material.url), formatDate(material.createdAt), courses && (course?.name ?? 'No course'), material.shelf ? `Shelf: ${material.shelf}` : null]
                : [KIND_LABEL[kindOf(material)], formatBytes(material.size), formatDate(material.createdAt), courses && (course?.name ?? 'No course'), material.shelf ? `Shelf: ${material.shelf}` : null]
              ).filter(Boolean).join(', ')}
            </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
