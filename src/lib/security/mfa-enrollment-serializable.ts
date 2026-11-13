import { Prisma } from "@prisma/client";

// A serializable transaction can abort during concurrent enrollment attempts.
// Retry only PostgreSQL/Prisma write-conflict P2034, with a strict upper bound.
// The callback must re-read enrollment state on each attempt.
export async function retrySerializableEnrollment<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2034" || attempt === 2) throw error;
    }
  }
  throw new Error("Enrollment retry exhausted");
}
