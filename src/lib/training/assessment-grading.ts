export type PublishedQuestion = { choices: readonly string[]; correctIndex: number };
export type GradingResult = { questionCount: number; correctCount: number; scorePercent: number; passingScorePercent: number; passed: boolean };

/** Server-side only: never serialize correctIndex to the learner. */
export function gradeTrainingAssessment(
  questions: readonly PublishedQuestion[],
  answers: readonly number[],
  passingScorePercent: number,
): GradingResult {
  if (questions.length === 0 || questions.length > 200 || answers.length !== questions.length) {
    throw new Error("Invalid assessment response count");
  }
  if (!Number.isFinite(passingScorePercent) || passingScorePercent < 0 || passingScorePercent > 100) {
    throw new Error("Invalid assessment passing threshold");
  }
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    if (!Array.isArray(question.choices) || question.choices.length < 2 ||
        !Number.isInteger(question.correctIndex) || question.correctIndex < 0 ||
        question.correctIndex >= question.choices.length ||
        !Number.isInteger(answers[index]) || answers[index] < 0 ||
        answers[index] >= question.choices.length) {
      throw new Error("Invalid assessment question or answer");
    }
  }
  const correctCount = questions.reduce((total, question, index) => total + Number(answers[index] === question.correctIndex), 0);
  const scorePercent = Math.round((correctCount / questions.length) * 10000) / 100;
  return { questionCount: questions.length, correctCount, scorePercent, passingScorePercent, passed: scorePercent >= passingScorePercent };
}
