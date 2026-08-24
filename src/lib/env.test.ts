import { describe, expect, it } from 'vitest';
import { getEnv } from './env';

describe('environment configuration', () => {
  it('accepts a valid database URL', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/trace_qms';
    expect(getEnv().DATABASE_URL).toContain('postgresql://');
  });
});
