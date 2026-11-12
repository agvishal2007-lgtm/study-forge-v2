import { useState } from 'react';
import { describeTemplate, type CourseTemplate } from '../data/courseTemplateRules';
import { applyTemplate, deleteTemplate, listAllTemplates, listMyTemplates, renameTemplate, saveCourseAsTemplate } from '../data/courseTemplates';
import { useLive } from '../data/useLive';
import { ConfirmDialog } from './ConfirmDialog';

/** Picks a template (or none) and shows exactly what it will add. */
export function TemplatePicker({ value, onChange, label = 'Start from a template' }: { value: string; onChange: (id: string, template: CourseTemplate | null) => void; label?: string }) {
  const { data: templates } = useLive(listAllTemplates);
  const chosen = templates?.find((template) => template.id === value) ?? null;
  return (
    <div className="template-picker">
      <label>
        {label}
        <select value={value} onChange={(event) => onChange(event.target.value, templates?.find((template) => template.id === event.target.value) ?? null)} data-testid="template-select">
          <option value="">Blank course</option>
          <optgroup label="Starter templates">
            {templates?.filter((template) => template.builtIn).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </optgroup>
          {templates?.some((template) => !template.builtIn) && (
            <optgroup label="Your templates">
              {templates.filter((template) => !template.builtIn).map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </optgroup>
          )}
        </select>
      </label>
      {chosen && (
        <details className="template-preview" data-testid="template-preview" open>
          <summary>Adds {describeTemplate(chosen)}</summary>
          {chosen.description && <p className="muted small">{chosen.description}</p>}
          {chosen.topics.length > 0 && <p className="small"><b>Topics:</b> {chosen.topics.map((topic) => (topic.heading ? `${topic.name} (${topic.heading})` : topic.name)).join(', ')}</p>}
          {chosen.categories.length > 0 && <p className="small"><b>Grade categories:</b> {chosen.categories.map((category) => (category.weight === null ? category.name : `${category.name} ${category.weight}%`)).join(', ')}</p>}
          <p className="muted small">No deadlines or requirements are added. Rename, remove or add anything afterwards. Set the weights from your own syllabus.</p>
        </details>
      )}
    </div>
  );
}

/** On a course: save its shape as a template, or add a template's topics to it. */
export function CourseTemplateTools({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [name, setName] = useState(`${courseName} template`);
  const [keepWeights, setKeepWeights] = useState(false);
  const [message, setMessage] = useState('');
  const [picked, setPicked] = useState<{ id: string; template: CourseTemplate | null }>({ id: '', template: null });
  return (
    <section className="template-tools" aria-labelledby="template-tools-heading" data-testid="course-template-tools">
      <h3 id="template-tools-heading">Templates</h3>
      <form className="inline-form" onSubmit={(event) => {
        event.preventDefault();
        void saveCourseAsTemplate(courseId, name, keepWeights)
          .then((template) => setMessage(`Saved “${template.name}”: ${describeTemplate(template)}. This course wasn’t changed.`))
          .catch((error: Error) => setMessage(`The template wasn’t saved. ${error.message}`));
      }}>
        <label>Save this course as a template<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} /></label>
        <label className="check-label"><input type="checkbox" checked={keepWeights} onChange={(event) => setKeepWeights(event.target.checked)} /> Keep the grade weights</label>
        <button className="button" type="submit">Save as template</button>
      </form>
      <p className="muted small">A template keeps topics and grade category names, never files, notes, grades or deadlines.</p>
      <div className="inline-form">
        <TemplatePicker label="Add topics and categories from a template" value={picked.id} onChange={(id, template) => setPicked({ id, template })} />
        <button className="button" type="button" disabled={!picked.template} onClick={() => {
          if (!picked.template) return;
          void applyTemplate(courseId, picked.template)
            .then((added) => { setMessage(added.topics + added.categories === 0 ? 'This course already has everything in that template.' : `Added ${added.topics} ${added.topics === 1 ? 'topic' : 'topics'} and ${added.categories} grade ${added.categories === 1 ? 'category' : 'categories'}. Nothing already here was changed.`); setPicked({ id: '', template: null }); })
            .catch((error: Error) => setMessage(`Nothing was added. ${error.message}`));
        }}>Add to this course</button>
      </div>
      {message && <p className="muted" role="status" data-testid="template-message">{message}</p>}
    </section>
  );
}

/** The student's own templates, on the Courses page, to rename or delete. */
export function MyTemplates() {
  const { data: mine } = useLive(listMyTemplates);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CourseTemplate | null>(null);
  if (!mine || mine.length === 0) return null;
  return (
    <section aria-labelledby="my-templates" data-testid="my-templates">
      <h2 id="my-templates">Your course templates</h2>
      <ul className="plain-list template-list">
        {mine.map((template) => (
          <li key={template.id}>
            {renaming === template.id
              ? (
                <form className="inline-form" onSubmit={(event) => {
                  event.preventDefault();
                  const value = String(new FormData(event.currentTarget).get('name') ?? '');
                  void renameTemplate(template.id, value).then(() => setRenaming(null));
                }}>
                  <label>Template name<input name="name" defaultValue={template.name} maxLength={80} autoFocus /></label>
                  <button className="button" type="submit">Save</button>
                  <button className="text-button" type="button" onClick={() => setRenaming(null)}>Cancel</button>
                </form>
              )
              : (
                <>
                  <span><b>{template.name}</b> <span className="muted small">{describeTemplate(template)}</span></span>
                  <span className="row-actions">
                    <button className="text-button" onClick={() => setRenaming(template.id)} aria-label={`Rename ${template.name}`}>Rename</button>
                    <button className="text-button danger-text" onClick={() => setDeleting(template)} aria-label={`Delete ${template.name}`}>Delete</button>
                  </span>
                </>
              )}
          </li>
        ))}
      </ul>
      <p className="muted small">Choose one when you add a course. Deleting a template never changes courses made from it.</p>
      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          confirmLabel="Delete template"
          onConfirm={() => { void deleteTemplate(deleting.id); setDeleting(null); }}
          onCancel={() => setDeleting(null)}
        >
          <p>Courses made from it keep everything they have.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
