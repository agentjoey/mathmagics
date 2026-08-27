export function canonicalInstant(value: string): string {
  const epochMs = Date.parse(value);
  if (Number.isNaN(epochMs)) {
    throw new Error('persisted instant must be a valid date-time');
  }
  return new Date(epochMs).toISOString();
}
