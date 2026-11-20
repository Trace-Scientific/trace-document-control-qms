import { describe, expect, it } from "vitest";
import { DemoQuizValidationError, scoreDemoQuiz } from "./demo-quiz";

describe("demo training server-safe quiz scoring", () => {
  it("scores both demo courses using the server answer key", () => {
    expect(scoreDemoQuiz("DEMO-HIPAA", [1, 1, 0])).toEqual({ correct: 3, total: 3, percentage: 100 });
    expect(scoreDemoQuiz("DEMO-BBP", [1, 0, 0])).toEqual({ correct: 2, total: 3, percentage: 67 });
  });
  it("rejects unknown courses and incomplete or invalid submissions", () => {
    expect(() => scoreDemoQuiz("OTHER", [1, 1, 0])).toThrow(DemoQuizValidationError);
    expect(() => scoreDemoQuiz("DEMO-HIPAA", [1, 1])).toThrow(DemoQuizValidationError);
    expect(() => scoreDemoQuiz("DEMO-HIPAA", [1, 1, 3])).toThrow(DemoQuizValidationError);
    expect(() => scoreDemoQuiz("DEMO-HIPAA", [1, 1, 0.5])).toThrow(DemoQuizValidationError);
    expect(() => scoreDemoQuiz("DEMO-BBP", [1, 1, 0, 0])).toThrow(DemoQuizValidationError);
  });
});
