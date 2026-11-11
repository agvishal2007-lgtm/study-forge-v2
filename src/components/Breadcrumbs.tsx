import { Link } from 'react-router-dom';

/** The trail back up, so a student always knows where they are and can get back in one tap. */
export function Breadcrumbs({ trail }: { trail: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <ol>
        {trail.map((step, index) => (
          <li key={`${step.label}-${index}`}>
            {step.to && index < trail.length - 1
              ? <Link to={step.to}>{step.label}</Link>
              : <span aria-current={index === trail.length - 1 ? 'page' : undefined}>{step.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
