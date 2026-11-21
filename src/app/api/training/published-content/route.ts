import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authenticateRequest, AuthenticationRequiredError } from "@/lib/security/authenticated-request";
import { requireAuthorization } from "@/lib/security/authorization";

const querySchema = z.object({ courseId: z.string().uuid(), version: z.coerce.number().int().positive().optional() }).strict();
type PublishedRow = { id: string; courseId: string; version: number; content: unknown; publishedAt: Date };
type Question = { prompt: string; choices: string[] };
type CourseContent = { lessons: Array<{ heading: string; content: string }>; assessment: { passingScorePercent: number; questions: Question[] } };

export async function GET(request: NextRequest) {
  try {
    const context = await authenticateRequest(request);
    requireAuthorization(context, { organizationId: context.organizationId, permission: "training.read" });
    const query = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const rows = await db.$queryRaw<PublishedRow[]>(Prisma.sql`
      SELECT "id", "courseId", "version", "content", "publishedAt"
      FROM "TrainingCoursePublishedVersion"
      WHERE "organizationId" = ${context.organizationId}::uuid
        AND "courseId" = ${query.courseId}::uuid
        ${query.version ? Prisma.sql`AND "version" = ${query.version}` : Prisma.empty}
      ORDER BY "version" DESC LIMIT 1
    `);
    const published = rows[0];
    if (!published) return NextResponse.json({ error: "Published course not found" }, { status: 404 });
    const parsed = published.content as Partial<CourseContent> | null;
    if (!Array.isArray(parsed?.lessons) || !Array.isArray(parsed?.assessment?.questions)) {
      return NextResponse.json({ error: "Published course content is unavailable" }, { status: 409 });
    }
    // Explicit allowlist: never expose correctIndex, explanations, or any other authoring metadata.
    const lessons = parsed.lessons.map((lesson) => ({ heading: lesson.heading, content: lesson.content }));
    const questions = parsed.assessment.questions.map((question) => ({ prompt: question.prompt, choices: question.choices }));
    return NextResponse.json({ data: { publicationId: published.id, courseId: published.courseId,
      version: published.version, publishedAt: published.publishedAt,
      lessons, assessment: { passingScorePercent: parsed.assessment.passingScorePercent, questions } } },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid published course request" }, { status: 422 });
    if (error instanceof Error && error.message === "Access denied") return NextResponse.json({ error: "Access denied" }, { status: 403 });
    return NextResponse.json({ error: "Unable to load published course" }, { status: 500 });
  }
}
