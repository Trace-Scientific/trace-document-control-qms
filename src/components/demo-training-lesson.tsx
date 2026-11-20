"use client";

import { useState } from "react";

import { catalog } from "../lib/training/demo-quiz";

export function DemoTrainingLesson({ courseCode }: { courseCode: string }) {
  const course = catalog[courseCode];
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);
  if (!course) return null;
  const answered = course.questions.every((_, index) => answers[index] !== undefined);
  const score = course.questions.filter((question, index) => answers[index] === question.correct).length;
  return <section className="module-section-stack" aria-label={course.title}>
    <h4>{course.title} — Interactive awareness preview</h4>
    <p><strong>Demonstration only:</strong> {course.disclaimer}</p>
    {course.lessons.map((lesson) => <article key={lesson.heading}><h5>{lesson.heading}</h5><p>{lesson.content}</p></article>)}
    <h5>Knowledge check</h5>
    <p>Practice questions only. Answers and scores stay in this browser view and do not create a training completion or credential.</p>
    {course.questions.map((question, index) => <fieldset key={question.prompt} disabled={showResults}>
      <legend>{index + 1}. {question.prompt}</legend>
      {question.options.map((option, optionIndex) => <label key={option}><input type="radio" name={`demo-question-${index}`} checked={answers[index] === optionIndex} onChange={() => setAnswers((previous) => ({ ...previous, [index]: optionIndex }))} /> {option}</label>)}
      {showResults && <p>{answers[index] === question.correct ? "Correct." : "Review needed."} {question.explanation}</p>}
    </fieldset>)}
    {showResults ? <div><p role="status">Practice score: {score} of {course.questions.length}. This is not a recorded training completion.</p><button type="button" onClick={() => { setAnswers({}); setShowResults(false); }}>Try again</button></div> : <button type="button" disabled={!answered} onClick={() => setShowResults(true)}>Check practice answers</button>}
  </section>;
}
