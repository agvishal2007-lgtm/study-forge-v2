import { getDb, notifyChanged } from './db';
import { createCourse } from './store';
import type { Checkpoint, GuidedQuestion, Lesson } from './types';

/** A short, ready-to-study example, so a new student can see how Guided Study works. */
const multiple = (prompt: string, options: string[], correctOption: number, explanation: string, idea: string, kind: GuidedQuestion['kind'] = 'multiple'): Omit<GuidedQuestion, 'id'> => ({
  kind, prompt, options, correctOption, accepted: [], modelAnswer: options[correctOption], explanation, idea,
});
const typed = (prompt: string, accepted: string[], modelAnswer: string, explanation: string, idea: string, kind: GuidedQuestion['kind']): Omit<GuidedQuestion, 'id'> => ({
  kind, prompt, options: [], correctOption: null, accepted, modelAnswer, explanation, idea,
});


export const SAMPLE_CHECKPOINTS = [
  {
    title: 'The accounting equation',
    teaching: {
      intro: 'Every business, from a food truck to a global company, tracks its money using one simple equation.',
      meaning: 'The accounting equation is: Assets = Liabilities + Equity. What a business has must equal what it owes plus what the owners have claim to.',
      why: 'It keeps the books in balance. Every transaction is recorded so that both sides stay equal, which makes mistakes easier to catch.',
      parts: [
        'Assets are things the business owns that have value, such as cash, equipment, and inventory.',
        'Liabilities are what the business owes to others, such as a bank loan or unpaid bills.',
        'Equity is the owner\'s share: what would be left if the business paid off everything it owes.',
      ],
      example: 'Maya starts a bakery. She puts in $5,000 of her own money, then borrows $2,000 from a bank.',
      walkthrough: [
        'Maya invests $5,000. Cash, an asset, goes up by $5,000. Her equity also goes up by $5,000.',
        'The bank lends $2,000. Cash goes up by another $2,000, and the loan, a liability, goes up by $2,000.',
        'Check the balance. Assets are $7,000. Liabilities of $2,000 plus equity of $5,000 also make $7,000.',
      ],
      keyIdea: 'Assets = Liabilities + Equity, and every transaction keeps both sides equal.',
    },
    questions: [
      multiple('Which of these is a liability?', ['Cash in the bank', 'A delivery van the business owns', 'A loan the business must repay', 'The owner\'s investment'], 2, 'A liability is something the business owes. A loan must be repaid, so it\'s a liability. Cash and the van are assets, and the owner\'s investment is equity.', 'the three parts'),
      multiple('Assets are $10,000 and liabilities are $4,000. What is equity?', ['$4,000', '$6,000', '$10,000', '$14,000'], 1, 'Rearrange the equation: Equity = Assets − Liabilities. $10,000 − $4,000 = $6,000.', 'using the equation'),
      typed('A shop has $3,000 in liabilities and $9,000 in equity. How much does it have in assets? Type the dollar amount.', ['12000', '12,000', '$12,000', '$12000'], '$12,000', 'Assets = Liabilities + Equity. $3,000 + $9,000 = $12,000.', 'using the equation', 'worked'),
      multiple('Maya buys a $500 oven and pays with cash. What happens?', ['Assets go up by $500', 'One asset goes down and another goes up, so total assets stay the same', 'Liabilities go up by $500', 'Equity goes down by $500'], 1, 'Cash goes down by $500 and equipment goes up by $500. Both are assets, so the total doesn\'t change, and the equation stays balanced.', 'how transactions change it', 'application'),
      multiple('Maya buys a $1,000 mixer on credit, promising to pay next month. What happens?', ['Assets and liabilities both go up by $1,000', 'Assets go down by $1,000', 'Equity goes up by $1,000', 'Nothing changes until she pays'], 0, 'She gains an asset worth $1,000 and now owes $1,000. Both sides go up by the same amount, so it stays balanced.', 'how transactions change it', 'application'),
    ],
    explainPrompt: 'Explain the accounting equation in your own words. What does each part mean, and why must the two sides stay equal?',
    keyPoints: [
      'Assets are what the business owns.',
      'Liabilities are what it owes, and equity is the owner\'s share.',
      'Assets always equal liabilities plus equity, so transactions keep both sides balanced.',
    ],
    reteach: [
      { idea: 'the three parts', explanation: 'Try asking one question about each item: Do they own it? Do they owe it? Or is it the owner\'s share?', example: 'A college student\'s car is something they own, like an asset. The car loan is something they owe, like a liability. The part of the car they\'ve paid off is their share, like equity.' },
      { idea: 'using the equation', explanation: 'The equation works in any direction. Fill in the two numbers you know, then solve for the third.', example: 'A $20,000 car with a $15,000 loan: 20,000 = 15,000 + equity, so equity is $5,000.' },
      { idea: 'how transactions change it', explanation: 'Ask what changed and on which side. If two assets swap, the total stays the same. If something new comes with a debt, both sides rise together.', example: 'Using $50 of cash to buy textbooks you\'ll keep swaps one thing you own for another. Buying them on a credit card adds something you own and something you owe.' },
    ],
    sourceNote: 'Sample lesson written for Study Forge.',
  },
  {
    title: 'Cash basis and accrual basis',
    teaching: {
      intro: 'Two businesses can have the same sales and the same bills, yet report different results in a month. The reason is when they record things.',
      meaning: 'Cash basis records income and expenses when money actually moves. Accrual basis records them when they are earned or owed, even if no money has moved yet.',
      why: 'Accrual shows how the business really performed in a period, and it\'s what larger companies generally use. Cash basis is simpler and shows what actually came in and went out.',
      parts: [
        'Revenue on cash basis is recorded when the customer pays.',
        'Revenue on accrual basis is recorded when the work is done or the product is delivered.',
        'Expenses follow the same pattern: when paid for cash basis, and when incurred for accrual basis.',
      ],
      example: 'A designer finishes a $1,000 logo in March, and the client pays in April.',
      walkthrough: [
        'The work is done in March. On accrual basis, the $1,000 is revenue in March.',
        'The money arrives in April. On cash basis, the $1,000 is revenue in April.',
        'It\'s the same $1,000 either way. The only difference is which month it belongs to.',
      ],
      keyIdea: 'Cash basis follows the money. Accrual basis follows the work.',
    },
    questions: [
      multiple('Under cash basis, when is revenue recorded?', ['When the work is finished', 'When the customer pays', 'When the invoice is sent', 'At the end of the year'], 1, 'Cash basis follows the money, so revenue is recorded when payment arrives.', 'the basic difference'),
      multiple('Under accrual basis, when is an expense recorded?', ['When it\'s incurred, even if it isn\'t paid yet', 'Only when it\'s paid', 'When the owner approves it', 'At tax time'], 0, 'Accrual follows the activity, so an expense counts when it\'s incurred, even if the payment comes later.', 'the basic difference'),
      multiple('A plumber finishes a job in May. The customer pays in June. Using accrual basis, when is the revenue recorded?', ['May', 'June', 'Half in each month', 'Neither month'], 0, 'The work was finished in May, so accrual records the revenue in May. Cash basis would record it in June.', 'applying it to a month', 'application'),
      multiple('A business pays December\'s electric bill in January. Using cash basis, when is the expense recorded?', ['December', 'January', 'Both months', 'Neither month'], 1, 'Cash basis records it when the money leaves, which is January. Accrual would record it in December.', 'applying it to a month', 'application'),
    ],
    explainPrompt: 'Explain the difference between cash-basis accounting and accrual accounting in your own words. Use an example if it helps.',
    keyPoints: [
      'Cash basis records things when money actually moves.',
      'Accrual basis records things when they are earned or incurred.',
      'The same transaction can land in different periods depending on the method.',
    ],
    reteach: [
      { idea: 'the basic difference', explanation: 'Picture two questions. Cash basis asks, "When did the money move?" Accrual asks, "When did the work happen?"', example: 'You tutor someone on Friday and they pay you on Monday. The tutoring happened Friday, which is accrual. The money moved Monday, which is cash basis.' },
      { idea: 'applying it to a month', explanation: 'Find two dates: when the work or usage happened, and when the money moved. Accrual uses the first date, and cash basis uses the second.', example: 'A landscaper mows in July and gets paid in August. Accrual says July, and cash basis says August.' },
    ],
    sourceNote: 'Sample lesson written for Study Forge.',
  },
];

export async function addSampleLesson(): Promise<Lesson> {
  const course = await createCourse('Sample: Accounting Basics', 'SAMPLE');
  const now = Date.now();
  const lesson: Lesson = { id: crypto.randomUUID(), courseId: course.id, label: 'Lesson', title: 'Lesson 1: How accounting keeps score', order: now, createdAt: now };
  const tx = (await getDb()).transaction(['lessons', 'checkpoints'], 'readwrite');
  await tx.objectStore('lessons').put(lesson);
  for (const [index, sample] of SAMPLE_CHECKPOINTS.entries()) {
    const checkpoint: Checkpoint = {
      ...sample,
      id: crypto.randomUUID(),
      lessonId: lesson.id,
      order: index + 1,
      materialId: null,
      createdAt: now + index,
      questions: sample.questions.map((question) => ({ ...question, id: crypto.randomUUID() })),
    };
    await tx.objectStore('checkpoints').put(checkpoint);
  }
  await tx.done;
  notifyChanged();
  return lesson;
}
