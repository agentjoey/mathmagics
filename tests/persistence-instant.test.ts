import { describe, expect, it } from 'vitest';
import { canonicalInstant } from '@/lib/persistence/instant';

describe('canonicalInstant', () => {
  it('normalizes equivalent PostgreSQL and ISO timestamp strings to the same UTC instant', () => {
    expect(canonicalInstant('2026-08-26 10:01:00+00')).toBe('2026-08-26T10:01:00.000Z');
    expect(canonicalInstant('2026-08-26T10:01:00.000Z')).toBe('2026-08-26T10:01:00.000Z');
  });

  it('fails closed on an invalid persisted timestamp', () => {
    expect(() => canonicalInstant('not-a-time')).toThrow('persisted instant must be a valid date-time');
  });
});
