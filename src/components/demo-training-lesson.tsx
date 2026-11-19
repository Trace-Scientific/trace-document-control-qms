"use client";

import { useState } from "react";

type Question = { prompt: string; options: string[]; correct: number; explanation: string };
type Lesson = { heading: string; content: string };
type DemoCourse = { title: string; disclaimer: string; lessons: Lesson[]; questions: Question[] };

const catalog: Record<string, DemoCourse> = {
  "DEMO-HIPAA": {
    title: "HIPAA Privacy Training (Demo)",
    disclaimer: "Synthetic awareness demonstration only. Not certified HIPAA training or proof of compliance. Follow your organization's current policies.",
    lessons: [
      { heading: "1. Minimum necessary access", content: "Access protected health information (PHI) only when your authorized duties require it. Use the minimum information needed for the task, and do not browse records out of curiosity. Some treatment disclosures have exceptions to the minimum necessary standard; follow applicable policy." },
      { heading: "2. Secure handling and disclosure", content: "Use approved systems and access controls. Verify recipients before sharing PHI, protect workstations and printed material, and avoid unapproved personal messaging or storage. Report a misdirected disclosure promptly." },
      { heading: "3. Recognize and report incidents", content: "Lost devices, suspicious messages, improper access, and disclosures to the wrong person may be security or privacy incidents. Preserve relevant facts and report promptly through the organization's incident process; do not investigate on your own." },
    ],
    questions: [
      { prompt: "A coworker asks to view a patient's record out of curiosity. What should you do?", options: ["Open the record", "Decline and follow authorized-access policy", "Send a screenshot"], correct: 1, explanation: "Curiosity is not an authorized reason to access PHI." },
      { prompt: "You realize PHI was sent to the wrong recipient. What is the best next action?", options: ["Ignore it if the recipient seems trustworthy", "Report promptly through the approved incident process", "Delete your sent message and say nothing"], correct: 1, explanation: "Prompt reporting enables the organization to evaluate and respond." },
      { prompt: "Which channel should be used to share PHI for authorized work?", options: ["An approved, access-controlled system", "A personal messaging account", "A public shared folder"], correct: 0, explanation: "Use organization-approved safeguards and verify recipients." },
    ],
  },
  "DEMO-BBP": {
    title: "Bloodborne Pathogens Safety (Demo)",
    disclaimer: "Synthetic safety awareness demonstration only. Not OSHA-certified training, site-specific instruction, or evidence of employee competency.",
    lessons: [
      { heading: "1. Exposure routes and precautions", content: "Blood and certain other potentially infectious materials can present exposure risks through needlesticks, mucous membranes, or broken skin. Apply standard precautions and follow your site's exposure-control plan for tasks with potential exposure." },
      { heading: "2. PPE and sharps safety", content: "Select task-appropriate personal protective equipment, use designated sharps containers, and follow approved procedures for handling contaminated materials. Do not recap used needles unless a specific approved procedure requires it." },
      { heading: "3. Exposure response and reporting", content: "After a possible exposure, follow site procedures for immediate first aid, promptly notify the designated supervisor or safety contact, and seek timely medical evaluation according to the exposure-control plan." },
    ],
    questions: [
      { prompt: "Where should a used contaminated needle go?", options: ["Regular trash", "An approved sharps container", "A desk drawer"], correct: 1, explanation: "Use the designated sharps container and local procedure." },
      { prompt: "After a potential occupational exposure, what should you do?", options: ["Wait until the next shift", "Follow immediate first aid and report promptly", "Keep working without reporting"], correct: 1, explanation: "Timely reporting and medical evaluation matter." },
      { prompt: "Which approach best reduces exposure risk?", options: ["Use task-appropriate PPE and standard precautions", "Rely on gloves for every hazard", "Skip PPE for brief tasks"], correct: 0, explanation: "Select controls and PPE based on the task and exposure-control plan." },
    ],
  },
};

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
