import { useState } from 'react';
import { LINK_CATEGORIES, LINK_CATEGORY_LABEL, categorize, tidyUrl, type LinkCategory } from '../data/linkRules';
import { saveLink } from '../data/store';

/**
 * Saves a web address as a resource. The wording is deliberate: Study Forge keeps the address, not
 * a copy of the page, and a site that needs a login will still need it.
 */
export function SaveLinkForm({ courseId, topicId }: { courseId?: string | null; topicId?: string | null }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<LinkCategory | ''>('');
  const [failure, setFailure] = useState('');
  const [saved, setSaved] = useState('');
  const guess = tidyUrl(url) ? categorize(tidyUrl(url) as string) : null;

  return (
    <form
      className="save-link"
      data-testid="save-link"
      onSubmit={async (event) => {
        event.preventDefault();
        setFailure('');
        setSaved('');
        try {
          const link = await saveLink({ url, name, category: category || undefined, courseId, topicId });
          setSaved(`Saved ${link.name}.`);
          setUrl('');
          setName('');
          setCategory('');
        } catch (problem) {
          setFailure((problem as Error).message);
        }
      }}
    >
      <label>
        Web address
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.jstor.org/stable/..."
          inputMode="url"
          required
        />
      </label>
      <label>Name it (optional)<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Left blank, the address is used" /></label>
      <label>
        Kind
        <select value={category} onChange={(event) => setCategory(event.target.value as LinkCategory | '')}>
          <option value="">{guess ? `Work it out (${LINK_CATEGORY_LABEL[guess]})` : 'Work it out from the address'}</option>
          {LINK_CATEGORIES.map((option) => <option key={option} value={option}>{LINK_CATEGORY_LABEL[option]}</option>)}
        </select>
      </label>
      <button className="button" type="submit">Save link</button>
      <p className="muted small">
        Study Forge saves the address, not the page. It does not download or import what the link points at,
        and a site that needs your login will still ask for it.
      </p>
      {failure && <p className="error" role="alert">{failure}</p>}
      {saved && <p className="muted" role="status">{saved}</p>}
    </form>
  );
}
