import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { emptyTeaching, getCheckpoint, getLesson, saveCheckpoint } from '../../data/guided';
import { listMaterials } from '../../data/store';
import type { Checkpoint, GuidedQuestion, QuestionKind, Reteach } from '../../data/types';
import { useLive } from '../../data/useLive';

const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);

interface QuestionDraft {
  id: string;
  kind: QuestionKind;
  prompt: string;
  optionsText: string;
  correct: string;
  acceptedText: string;
  modelAnswer: string;
  explanation: string;
  idea: string;
}

const KIND_LABEL: Record<QuestionKind, string> = {
  multiple: 'Multiple choice',
  short: 'Short answer',
  recall: 'Recall from memory',
  worked: 'Worked problem',
  application: 'Apply it to a situation',
};

const blankQuestion = (): QuestionDraft => ({
  id: crypto.randomUUID(), kind: 'multiple', prompt: '', optionsText: '', correct: '', acceptedText: '', modelAnswer: '', explanation: '', idea: '',
});

const toDraft = (question: GuidedQuestion): QuestionDraft => ({
  id: question.id,
  kind: question.kind,
  prompt: question.prompt,
  optionsText: question.options.join('\n'),
  correct: question.correctOption === null ? '' : String(question.correctOption + 1),
  acceptedText: question.accepted.join('\n'),
  modelAnswer: question.modelAnswer,
  explanation: question.explanation,
  idea: question.idea,
});

interface Form {
  title: string;
  intro: string;
  meaning: string;
  why: string;
  parts: string;
  example: string;
  walkthrough: string;
  keyIdea: string;
  explainPrompt: string;
  keyPoints: string;
  reteachExplanation: string;
  reteachExample: string;
  sourceNote: string;
  materialId: string;
}

const blankForm: Form = {
  title: '', intro: '', meaning: '', why: '', parts: '', example: '', walkthrough: '', keyIdea: '',
  explainPrompt: '', keyPoints: '', reteachExplanation: '', reteachExample: '', sourceNote: '', materialId: '',
};

/** Finds what's wrong in plain words. An empty list means it can be saved. */
function problemsWith(form: Form, questions: QuestionDraft[]): string[] {
  const problems: string[] = [];
  if (!form.title.trim()) problems.push('Enter a checkpoint title.');
  questions.forEach((question, index) => {
    const name = `Question ${index + 1}`;
    if (!question.prompt.trim()) problems.push(`${name} needs a question.`);
    const options = lines(question.optionsText);
    if (question.optionsText.trim()) {
      if (options.length < 2) problems.push(`${name} needs at least two answer choices.`);
      const correct = Number(question.correct);
      if (!Number.isInteger(correct) || correct < 1 || correct > options.length) problems.push(`${name} needs the number of its correct choice, from 1 to ${Math.max(options.length, 1)}.`);
    } else if (question.kind === 'multiple') {
      problems.push(`${name} is multiple choice, so it needs answer choices.`);
    } else if (!question.modelAnswer.trim() && !question.acceptedText.trim()) {
      problems.push(`${name} needs a model answer, so you can check your response against it.`);
    }
  });
  return problems;
}

export function CheckpointEditorPage() {
  const { id = '', lessonId = '' } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form>(blankForm);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [existing, setExisting] = useState<Checkpoint | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);
  const { data: lesson } = useLive(() => getLesson(lessonId), [lessonId]);
  const { data: materials } = useLive(listMaterials);

  useEffect(() => {
    let active = true;
    void getCheckpoint(id).then((checkpoint) => {
      if (!active) return;
      if (checkpoint) {
        const t = checkpoint.teaching;
        setExisting(checkpoint);
        setForm({
          title: checkpoint.title, intro: t.intro, meaning: t.meaning, why: t.why, parts: t.parts.join('\n'), example: t.example,
          walkthrough: t.walkthrough.join('\n'), keyIdea: t.keyIdea, explainPrompt: checkpoint.explainPrompt, keyPoints: checkpoint.keyPoints.join('\n'),
          reteachExplanation: checkpoint.reteach[0]?.explanation ?? '', reteachExample: checkpoint.reteach[0]?.example ?? '',
          sourceNote: checkpoint.sourceNote, materialId: checkpoint.materialId ?? '',
        });
        setQuestions(checkpoint.questions.map(toDraft));
      } else {
        setQuestions([blankQuestion()]);
      }
      setLoaded(true);
    });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  if (!loaded) return <p className="page muted">Loading…</p>;
  if (lesson === undefined && !existing) return <div className="page"><h1>This lesson doesn't exist</h1><Link to="/study">Go to Study</Link></div>;

  const field = (key: keyof Form, label: string, hint?: string, placeholder?: string) => (
    <label>{label}{hint && <span className="hint">{hint}</span>}
      <textarea value={form[key]} placeholder={placeholder} onChange={(event) => { dirty.current = true; setForm({ ...form, [key]: event.target.value }); }} />
    </label>
  );
  const changeQuestion = (index: number, patch: Partial<QuestionDraft>) => {
    dirty.current = true;
    setQuestions(questions.map((question, position) => (position === index ? { ...question, ...patch } : question)));
  };

  const save = async () => {
    const found = problemsWith(form, questions);
    setProblems(found);
    if (found.length > 0) return;
    setSaving(true);
    const built: GuidedQuestion[] = questions.map((question) => {
      const options = lines(question.optionsText);
      return {
        id: question.id,
        kind: question.kind,
        prompt: question.prompt.trim(),
        options,
        correctOption: options.length ? Number(question.correct) - 1 : null,
        accepted: lines(question.acceptedText),
        modelAnswer: question.modelAnswer.trim() || (options.length ? options[Number(question.correct) - 1] : ''),
        explanation: question.explanation.trim(),
        idea: question.idea.trim(),
      };
    });
    const reteach: Reteach[] = [...(existing?.reteach.slice(1) ?? [])];
    if (form.reteachExplanation.trim() || form.reteachExample.trim()) {
      reteach.unshift({ idea: existing?.reteach[0]?.idea ?? '', explanation: form.reteachExplanation.trim(), example: form.reteachExample.trim() });
    }
    const checkpoint: Checkpoint = {
      id,
      lessonId,
      title: form.title.trim(),
      order: existing?.order ?? Date.now(),
      createdAt: existing?.createdAt ?? Date.now(),
      teaching: {
        ...emptyTeaching(),
        intro: form.intro.trim(), meaning: form.meaning.trim(), why: form.why.trim(), parts: lines(form.parts),
        example: form.example.trim(), walkthrough: lines(form.walkthrough), keyIdea: form.keyIdea.trim(),
      },
      questions: built,
      explainPrompt: form.explainPrompt.trim(),
      keyPoints: lines(form.keyPoints),
      reteach,
      sourceNote: form.sourceNote.trim(),
      materialId: form.materialId || null,
    };
    try {
      await saveCheckpoint(checkpoint);
      dirty.current = false;
      navigate(`/study/lessons/${lessonId}`, { replace: true });
    } catch (error) {
      setProblems([`The checkpoint wasn't saved, but your text is still here. ${(error as Error).message}`]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page editor">
      <h1>{existing ? 'Edit checkpoint' : 'New checkpoint'}</h1>
      <p className="muted">One small idea. You can save it unfinished, but it needs teaching, a question, and key points before you can study it.</p>
      <label className="note-title-label">Checkpoint title<input value={form.title} onChange={(event) => { dirty.current = true; setForm({ ...form, title: event.target.value }); }} placeholder="Assets and liabilities" /></label>

      <fieldset>
        <legend>Teach it</legend>
        {field('intro', 'Introduce the topic')}
        {field('meaning', 'What it means, in simple words')}
        {field('why', 'Why it matters')}
        {field('parts', 'Smaller parts', 'One on each line.')}
        {field('example', 'A realistic example')}
        {field('walkthrough', 'Walk through the example', 'One step on each line.')}
        {field('keyIdea', 'The most important idea')}
      </fieldset>

      <fieldset>
        <legend>Practice questions</legend>
        <p className="muted">Three or more works best. Questions appear one at a time.</p>
        {questions.map((question, index) => (
          <div className="editor-question" key={question.id}>
            <h3>Question {index + 1}</h3>
            <label>Type
              <select value={question.kind} onChange={(event) => changeQuestion(index, { kind: event.target.value as QuestionKind })}>
                {(Object.keys(KIND_LABEL) as QuestionKind[]).map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
              </select>
            </label>
            <label>Question<textarea value={question.prompt} onChange={(event) => changeQuestion(index, { prompt: event.target.value })} /></label>
            <label>Answer choices<span className="hint">One on each line. Leave empty if the answer is typed.</span>
              <textarea value={question.optionsText} onChange={(event) => changeQuestion(index, { optionsText: event.target.value })} />
            </label>
            {question.optionsText.trim() && (
              <label>Which choice is correct?<span className="hint">Enter its number: 1 for the first line, 2 for the second.</span>
                <input inputMode="numeric" value={question.correct} onChange={(event) => changeQuestion(index, { correct: event.target.value })} />
              </label>
            )}
            {!question.optionsText.trim() && (
              <>
                <label>Model answer<span className="hint">Shown after answering, so the student can check themselves.</span>
                  <textarea value={question.modelAnswer} onChange={(event) => changeQuestion(index, { modelAnswer: event.target.value })} />
                </label>
                <label>Exact answers that are automatically right (optional)<span className="hint">One on each line. Best for numbers.</span>
                  <textarea value={question.acceptedText} onChange={(event) => changeQuestion(index, { acceptedText: event.target.value })} />
                </label>
              </>
            )}
            <label>Why this is the answer<textarea value={question.explanation} onChange={(event) => changeQuestion(index, { explanation: event.target.value })} /></label>
            <label>Which part does this test? (optional)<span className="hint">Questions with the same words here are treated as one idea when reteaching.</span>
              <input value={question.idea} onChange={(event) => changeQuestion(index, { idea: event.target.value })} />
            </label>
            <button className="text-button danger-text" type="button" onClick={() => { dirty.current = true; setQuestions(questions.filter((_, position) => position !== index)); }}>Remove question {index + 1}</button>
          </div>
        ))}
        <div className="session-actions">
          <button className="button" type="button" onClick={() => { dirty.current = true; setQuestions([...questions, blankQuestion()]); }}>Add question</button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Explain it in your own words</legend>
        {field('explainPrompt', 'What to ask', undefined, 'Explain the difference between assets and liabilities in your own words.')}
        {field('keyPoints', 'Key points a good explanation includes', 'One on each line. The student compares their explanation to these.')}
      </fieldset>

      <fieldset>
        <legend>If a student struggles</legend>
        {field('reteachExplanation', 'Explain it a different way')}
        {field('reteachExample', 'A different example')}
      </fieldset>

      <fieldset>
        <legend>Where this came from</legend>
        {field('sourceNote', 'Source', undefined, 'Textbook chapter 1, lecture on Sept 12')}
        <label>Original file (optional)
          <select value={form.materialId} onChange={(event) => { dirty.current = true; setForm({ ...form, materialId: event.target.value }); }}>
            <option value="">None</option>
            {materials?.map((material) => <option key={material.id} value={material.id}>{material.name}</option>)}
          </select>
        </label>
      </fieldset>

      {problems.length > 0 && (
        <div className="error-box" role="alert" data-testid="editor-problems">
          <strong>This isn't saved yet.</strong>
          <ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        </div>
      )}
      <div className="editor-actions">
        <button className="button primary" disabled={saving} onClick={() => void save()}>Save checkpoint</button>
        <Link to={`/study/lessons/${lessonId}`}>Cancel</Link>
      </div>
    </div>
  );
}
