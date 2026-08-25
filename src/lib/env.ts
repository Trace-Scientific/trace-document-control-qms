import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .refine(
      (value) =>
        value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "DATABASE_URL must use PostgreSQL",
    ),
  APP_BASE_URL: z.string().url().optional(),
  CRON_SECRET: z.string().min(32).optional(),
});

export function getEnv(source: NodeJS.ProcessEnv = process.env) {
  return envSchema.parse({
    DATABASE_URL: source.DATABASE_URL,
    APP_BASE_URL: source.APP_BASE_URL,
    CRON_SECRET: source.CRON_SECRET,
  });
}
