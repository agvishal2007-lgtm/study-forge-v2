import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWalkthrough } from '../walkthrough/Walkthrough';
import { ACADEMY, type AcademyTopic } from './academyContent';

const matches = (topic: AcademyTopic, words: string[]) => {
  const text = [topic.title, topic.what, topic.why, topic.where, ...topic.steps, topic.result, ...topic.limits, topic.connections].join(' ').toLowerCase();
  return words.every((word) => text.includes(word));
};

/** The Academy's reference guide: the full details behind each lesson, searchable. Lessons are the main way to learn. */
export function AcademyGuide() {
  const { start } = useWalkthrough();
  const [query, setQuery] = useState('');
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = useMemo(() => (words.length ? ACADEMY.filter((topic) => matches(topic, words)) : ACADEMY), [query]);
  // A lesson's "Learn more" opens the guide at its section.
  const wanted = new URLSearchParams(useLocation().search).get('topic');
  useEffect(() => { if (wanted) document.getElementById(`academy-${wanted}`)?.scrollIntoView({ block: 'start' }); }, [wanted]);
  return (
    <div className="page academy" data-testid="academy">
      <p className="small"><Link to="/help">← Academy lessons</Link></p>
      <h1>Academy reference guide</h1>
      <p className="muted">The full details behind the lessons: what each part does, why it helps, where to find it, how to use it, and its limits. Everything here is live and tested.</p>
      <div className="academy-tools">
        <button type="button" className="button" onClick={start}>Take the short walkthrough</button>
        <label className="search academy-search">Search the Academy
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="calculator, sync, Trash…" />
        </label>
      </div>
      <nav aria-label="Academy topics" className="academy-toc">
        <ul>{shown.map((topic) => <li key={topic.id}><a href={`#/help/guide`} onClick={(event) => { event.preventDefault(); document.getElementById(`academy-${topic.id}`)?.scrollIntoView({ block: 'start' }); }}>{topic.title}</a></li>)}</ul>
      </nav>
      {shown.length === 0 && <p className="muted" role="status">Nothing in the Academy matches that. Try another word.</p>}
      {shown.map((topic) => (
        <section key={topic.id} id={`academy-${topic.id}`} className="academy-topic" aria-labelledby={`academy-h-${topic.id}`}>
          <h2 id={`academy-h-${topic.id}`}>{topic.title}</h2>
          <p><b>What it does.</b> {topic.what}</p>
          <p><b>Why it helps.</b> {topic.why}</p>
          <p><b>Where to find it.</b> {topic.where}</p>
          <h3>How to use it</h3>
          <ol>{topic.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          <p><b>What you’ll see.</b> {topic.result}</p>
          <h3>Good to know</h3>
          <ul>{topic.limits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
          <p className="muted"><b>Works with.</b> {topic.connections}</p>
        </section>
      ))}
      <p className="muted"><Link to="/terms">Terms of Use</Link> · <Link to="/privacy">Privacy Policy</Link></p>
    </div>
  );
}
