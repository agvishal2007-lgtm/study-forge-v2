import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useStillHere } from '../components/useStillHere';
import {
  deletePracticeQuestion, deletePracticeSet, getPracticeSet, listPracticeAttempts, listPracticeQuestions, savePracticeQuestion, updatePracticeSet,
} from '../data/practice';
import { latestAnswers, questionProblems, splitLines } from '../data/practiceRules';
import { listAllCourses, listTopics } from '../data/store';
import { PRACTICE_KIND_LABEL, PRACTICE_KINDS, type PracticeKind, type PracticeQuestion } from '../data/types';
import { useLive } from '../data/useLive';

const RESULT_LABEL = { correct: 'Last answer: correct', partial: 'Last answer: partly right', wrong: 'Last answer: wrong' };

function QuestionForm({ setId, question, onDone }: { setId: string; question?: PracticeQuestion; onDone: () => void }) {
  const [kind, setKind] = useState<PracticeKind>(question?.kind ?? 'multiple');
  const [prompt, setPrompt] = useState(question?.prompt ?? '');
  const [optionsText, setOptionsText] = useState(question?.options.join('\n') ?? '');
  const [correct, setCorrect] = useState(question?.correctOption === null || question?.correctOption === undefined ? '' : String(question.correctOption));
  const [acceptedText, setAcceptedText] = useState(question?.accepted.join('\n') ?? '');
  const [modelAnswer, setModelAnswer] = useState(question?.modelAnswer ?? '');
  const [explanation, setExplanation] = useState(question?.explanation ?? '');
  const [topic, setTopic] = useState(question?.topic ?? '');
  const [source, setSource] = useState(question?.source ?? '');
  const [problems, setProblems] = useState<string[]>([]);
  const promptBox = useRef<HTMLTextAreaElement>(null);
  const choices = useMemo(() => splitLines(optionsText), [optionsText]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const found = questionProblems({ kind, prompt, optionsText, correct, acceptedText, modelAnswer });
    setProblems(found);
    if (found.length > 0) return;
    const multiple = kind === 'multiple';
    try {
      await savePracticeQuestion({
        id: question?.id ?? crypto.randomUUID(),
        setId,
        kind,
        prompt: prompt.trim(),
        options: multiple ? choices : [],
        correctOption: multiple ? Number(correct) : null,
        accepted: multiple ? [] : splitLines(acceptedText),
        modelAnswer: modelAnswer.trim(),
        explanation: explanation.trim(),
        topic: topic.trim(),
        source: source.trim(),
      });
      if (question) {
        onDone();
      } else {
        setPrompt(''); setOptionsText(''); setCorrect(''); setAcceptedText(''); setModelAnswer(''); setExplanation('');
        promptBox.current?.focus();
        onDone();
      }
    } catch (error) {
      setProblems([`This wasn't saved, but your text is still here. ${(error as Error).message}`]);
    }
  };

  return (
    <form className="card-form" onSubmit={(event) => void save(event)} data-testid="question-form">
      <label>Type
        <select value={kind} onChange={(event) => setKind(event.target.value as PracticeKind)}>
          {PRACTICE_KINDS.map((option) => <option key={option} value={option}>{PRACTICE_KIND_LABEL[option]}</option>)}
        </select>
      </label>
      <label>Question<textarea aria-label="Question" ref={promptBox} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={kind === 'blank' ? 'Assets = Liabilities + ____' : 'What does the accounting equation show?'} /></label>
      {kind === 'multiple' ? (
        <>
          <label>Answer choices, one per line<textarea aria-label="Answer choices" value={optionsText} onChange={(event) => { setOptionsText(event.target.value); setCorrect(''); }} /></label>
          <label>Correct answer
            <select value={correct} onChange={(event) => setCorrect(event.target.value)}>
              <option value="">Choose one</option>
              {choices.map((choice, index) => <option key={`${index}-${choice}`} value={index}>{choice}</option>)}
            </select>
          </label>
        </>
      ) : (
        <>
          <label>Model answer<textarea aria-label="Model answer" value={modelAnswer} onChange={(event) => setModelAnswer(event.target.value)} placeholder="What a good answer looks like. You'll compare yours to this." /></label>
          <label>Accepted answers (optional), one per line<textarea aria-label="Accepted answers" value={acceptedText} onChange={(event) => setAcceptedText(event.target.value)} placeholder="Answers matching these are marked right automatically." /></label>
        </>
      )}
      <label>Explanation (optional)<textarea aria-label="Explanation" value={explanation} onChange={(event) => setExplanation(event.target.value)} /></label>
      <div className="form-row">
        <label>Topic (optional)<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Accruals" /></label>
        <label>Source (optional)<input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Chapter 3, page 40" /></label>
      </div>
      {problems.length > 0 && (
        <div className="error-box" role="alert" data-testid="question-problems">
          <strong>This isn't saved yet.</strong>
          <ul>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        </div>
      )}
      <div className="session-actions">
        <button className="button primary" type="submit">{question ? 'Save question' : 'Add question'}</button>
        {question && <button className="button" type="button" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}

export function PracticeSetPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const stillHere = useStillHere();
  const { data, error } = useLive(async () => {
    const [set, questions, attempts, courses] = await Promise.all([getPracticeSet(id), listPracticeQuestions(), listPracticeAttempts(), listAllCourses()]);
    return { set, questions: questions.filter((question) => question.setId === id), attempts, courses };
  }, [id]);
  const [editing, setEditing] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [removeQuestion, setRemoveQuestion] = useState<PracticeQuestion | null>(null);
  const [removeSet, setRemoveSet] = useState(false);
  const [editingSet, setEditingSet] = useState(false);
  const [setName, setSetName] = useState('');
  const [setCourse, setSetCourse] = useState('');
  const [setTopic, setSetTopic] = useState('');
  const [kind, setKindFilter] = useState('');
  const [failure, setFailure] = useState('');
  const { data: topics } = useLive(() => (setCourse ? listTopics(setCourse) : Promise.resolve([])), [setCourse]);
  useEffect(() => setFailure(''), [id]);

  if (error) return <div className="page"><h1>Practice</h1><p className="error" role="alert">This set couldn't be loaded. {error.message}</p></div>;
  if (!data) return <p className="page muted">Loading…</p>;
  const { set, questions, attempts, courses } = data;
  if (!set) return <div className="page"><h1>This set doesn't exist</h1><Link to="/practice">Go to Practice</Link></div>;
  const course = courses.find((entry) => entry.id === set.courseId);
  const latest = latestAnswers(attempts);
  const kindsHere = PRACTICE_KINDS.filter((option) => questions.some((question) => question.kind === option));

  return (
    <div className="page">
      <p><Link to="/practice">Back to Practice</Link></p>
      <header className="course-head">
        <h1>{set.name}</h1>
        <div className="session-actions">
          <button className="text-button" onClick={() => {
            setSetName(set.name);
            setSetCourse(set.courseId ?? '');
            setSetTopic(set.topicId ?? '');
            setEditingSet(true);
          }}>Edit set</button>
          <button className="text-button danger-text" onClick={() => setRemoveSet(true)}>Delete set</button>
        </div>
      </header>
      {course && <p className="muted">{course.name}</p>}
      {failure && <p className="error" role="alert">{failure}</p>}
      {editingSet && (
        <form className="card-form" onSubmit={async (event) => {
          event.preventDefault();
          if (!setName.trim()) {
            setFailure('Enter a name for the set.');
            return;
          }
          try {
            await updatePracticeSet(set.id, { name: setName, courseId: setCourse || null, topicId: setTopic || null });
            setFailure('');
            setEditingSet(false);
          } catch (problem) {
            setFailure(`That wasn't saved. ${(problem as Error).message}`);
          }
        }}>
          <label>Set name<input value={setName} onChange={(event) => setSetName(event.target.value)} /></label>
          <div className="form-row">
            <label>Course
              <select value={setCourse} onChange={(event) => { setSetCourse(event.target.value); setSetTopic(''); }}>
                <option value="">No course</option>
                {courses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
              </select>
            </label>
            {setCourse && (topics?.length ?? 0) > 0 && (
              <label>Topic
                <select value={setTopic} onChange={(event) => setSetTopic(event.target.value)}>
                  <option value="">No topic</option>
                  {topics?.map((topic) => <option key={topic.id} value={topic.id}>{topic.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="session-actions">
            <button className="button primary" type="submit">Save set</button>
            <button className="button" type="button" onClick={() => setEditingSet(false)}>Cancel</button>
          </div>
        </form>
      )}
      {questions.length > 0 && (
        <div className="practice-start">
          <label>Question type
            <select value={kind} onChange={(event) => setKindFilter(event.target.value)}>
              <option value="">All types</option>
              {kindsHere.map((option) => <option key={option} value={option}>{PRACTICE_KIND_LABEL[option]}</option>)}
            </select>
          </label>
          <Link className="button primary" to={`/practice/session?set=${set.id}${kind ? `&kind=${kind}` : ''}`}>Start practice</Link>
        </div>
      )}
      <section aria-labelledby="add-question-heading">
        <h2 id="add-question-heading">Add a question</h2>
        <QuestionForm key={formKey} setId={set.id} onDone={() => setFormKey((value) => value)} />
      </section>
      <section aria-labelledby="questions-heading">
        <h2 id="questions-heading">Questions ({questions.length})</h2>
        {questions.length === 0 && <p className="muted">No questions yet.</p>}
        <ul className="planner-list">
          {questions.map((question) => {
            if (editing === question.id) return <li key={question.id} className="planner-row"><QuestionForm setId={set.id} question={question} onDone={() => setEditing(null)} /></li>;
            const answer = latest.get(question.id);
            return (
              <li key={question.id} className="planner-row" data-testid="question-row">
                <div className="planner-main">
                  <span className="card-text"><strong>{question.prompt}</strong></span>
                  <span className="muted file-meta">{[PRACTICE_KIND_LABEL[question.kind], question.topic, answer ? RESULT_LABEL[answer.result] : 'Not answered yet'].filter(Boolean).join(', ')}</span>
                </div>
                <div className="planner-actions">
                  <button className="button" onClick={() => setEditing(question.id)} aria-label={`Edit ${question.prompt}`}>Edit</button>
                  <button className="text-button danger-text" onClick={() => setRemoveQuestion(question)} aria-label={`Delete ${question.prompt}`}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {removeQuestion && (
        <ConfirmDialog
          title="Delete this question?"
          confirmLabel="Delete question"
          onCancel={() => setRemoveQuestion(null)}
          onConfirm={async () => {
            const target = removeQuestion;
            setRemoveQuestion(null);
            await deletePracticeQuestion(target.id).catch((problem: Error) => setFailure(`It wasn't deleted. ${problem.message}`));
          }}
        >
          <p>This permanently removes the question and your past answers to it.</p>
        </ConfirmDialog>
      )}
      {removeSet && (
        <ConfirmDialog
          title={`Delete ${set.name}?`}
          confirmLabel="Delete set"
          onCancel={() => setRemoveSet(false)}
          onConfirm={async () => {
            setRemoveSet(false);
            try {
              await deletePracticeSet(set.id);
              if (stillHere.current) navigate('/practice', { replace: true });
            } catch (problem) {
              setFailure(`It wasn't deleted. ${(problem as Error).message}`);
            }
          }}
        >
          <p>This permanently removes the set, its {questions.length === 1 ? '1 question' : `${questions.length} questions`}, and your past answers.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
