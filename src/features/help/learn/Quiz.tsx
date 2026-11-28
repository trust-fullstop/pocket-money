// Lesson quiz: each question is a radio group. "Check answers" marks ✓/✗ with the why; wrong ones can be retried.
import { useId, useState } from 'react';
import { Button } from '../../../components/ui';
import type { QuizQuestion } from './types';
import { MarkIcon, RadioCards } from './ui';

export function Quiz({ questions, onAllRight, locked }: {
  questions: QuizQuestion[];
  /** Called once all answers are right, with the answers (option index per question). */
  onAllRight: (answers: number[]) => void;
  /** Everything is right and handed over: no more changes. */
  locked?: boolean;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  // The answer that was checked per question (null = not checked, or changed since).
  const [checked, setChecked] = useState<(number | null)[]>(() => questions.map(() => null));
  const [tried, setTried] = useState(false);
  const uid = useId();

  const isRight = (i: number) => checked[i] != null && checked[i] === questions[i].answer;
  const rightCount = questions.filter((_, i) => isRight(i)).length;
  const allRight = rightCount === questions.length;
  const missing = answers.filter((a) => a == null).length;
  const anyChecked = checked.some((c) => c != null);

  const pick = (i: number, v: number) => {
    setAnswers((a) => a.map((x, j) => (j === i ? v : x)));
    setChecked((c) => c.map((x, j) => (j === i ? null : x)));
  };

  const check = () => {
    setTried(true);
    if (missing > 0) return;
    setChecked(answers.slice());
    if (answers.every((a, i) => a === questions[i].answer)) onAllRight(answers as number[]);
  };

  let summary = '';
  if (tried && missing > 0) summary = `Answer every question first (${missing} to go).`;
  else if (anyChecked && allRight) summary = 'All right! 🎉';
  else if (anyChecked && checked.every((c) => c != null)) {
    summary = `${rightCount} of ${questions.length} right. Change the ones marked ✗ and check again.`;
  }

  return (
    <div className="space-y-5">
      <ol className="space-y-6">
        {questions.map((q, i) => {
          const c = checked[i];
          const right = c != null && c === q.answer;
          const fbId = `${uid}-fb-${i}`;
          return (
            <li key={i}>
              <RadioCards
                legend={<><span className="text-muted">{i + 1}. </span>{q.q}</>}
                value={answers[i] == null ? null : String(answers[i])}
                onChange={(v) => pick(i, Number(v))}
                disabled={right || locked}
                describedBy={c != null ? fbId : undefined}
                options={q.options.map((o, j) => ({
                  value: String(j),
                  label: o,
                  mark: c === j ? (j === q.answer ? 'right' : 'wrong') : undefined,
                }))}
              />
              {c != null && (
                <p id={fbId} className="mt-2 flex gap-2 text-[15px] leading-snug">
                  <MarkIcon mark={right ? 'right' : 'wrong'} />
                  <span>
                    <strong>{right ? 'Right! ' : 'Not quite. Try another answer. '}</strong>
                    {q.why}
                  </span>
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <p aria-live="polite" className={summary ? 'rounded-xl bg-surface-2 px-4 py-3 font-semibold' : 'sr-only'}>{summary}</p>

      {!allRight && !locked && (
        <Button block size="lg" icon="check" onClick={check}>
          {anyChecked ? 'Check again' : 'Check answers'}
        </Button>
      )}
    </div>
  );
}
