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
  FILE_SCAN_SECRET: z.string().min(32).optional(),
});

export function getEnv(
  source: Record<string, string | undefined> = process.env,
) {
  return envSchema.parse({
    DATABASE_URL: source.DATABASE_URL,
    APP_BASE_URL: source.APP_BASE_URL,
    CRON_SECRET: source.CRON_SECRET,
    FILE_SCAN_SECRET: source.FILE_SCAN_SECRET,
  });
}

const storageSchema = z.object({
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_REGION: z.string().min(1),
  OBJECT_STORAGE_BUCKET: z.string().min(3),
  OBJECT_STORAGE_ACCESS_KEY_ID: z.string().min(1),
  OBJECT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
});

export function getObjectStorageEnv(source: Record<string, string | undefined> = process.env) {
  return storageSchema.parse(source);
}
