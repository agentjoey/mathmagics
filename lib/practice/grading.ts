import type { AnswerSpec, AttemptOutcome } from './types';

export interface AttemptGrade {
  outcome: AttemptOutcome;
  normalizedAnswer: string;
}

function result(correct: boolean, normalizedAnswer: string): AttemptGrade {
  return { outcome: correct ? 'CORRECT' : 'INCORRECT', normalizedAnswer };
}

function normalizeInteger(value: string): string | undefined {
  const trimmed = value.trim();
  if (!/^[+-]?\d+$/u.test(trimmed)) return undefined;
  try {
    return BigInt(trimmed).toString();
  } catch {
    return undefined;
  }
}

function normalizeDecimal(value: string): string | undefined {
  const trimmed = value.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/u.exec(trimmed);
  if (!match) return undefined;
  const sign = match[1] === '-' ? '-' : '';
  const integerPart = (match[2] ?? '').replace(/^0+(?=\d)/u, '') || '0';
  const fractionPart = (match[3] ?? '').replace(/0+$/u, '');
  const zero = integerPart === '0' && !fractionPart;
  return `${zero ? '' : sign}${integerPart}${fractionPart ? `.${fractionPart}` : ''}`;
}

const BIGINT_ZERO = BigInt(0);
const BIGINT_ONE = BigInt(1);

function absBigInt(value: bigint): bigint {
  return value < BIGINT_ZERO ? -value : value;
}

function gcd(left: bigint, right: bigint): bigint {
  let a = absBigInt(left);
  let b = absBigInt(right);
  while (b !== BIGINT_ZERO) [a, b] = [b, a % b];
  return a;
}

interface ParsedFraction {
  numerator: bigint;
  denominator: bigint;
  normalized: string;
  simplestInput: boolean;
}

function parseFraction(value: string): ParsedFraction | undefined {
  const match = /^\s*([+-]?\d+)\s*\/\s*([+-]?\d+)\s*$/u.exec(value);
  if (!match) return undefined;
  let numerator: bigint;
  let denominator: bigint;
  try {
    numerator = BigInt(match[1]!);
    denominator = BigInt(match[2]!);
  } catch {
    return undefined;
  }
  if (denominator === BIGINT_ZERO) return undefined;
  const inputGcd = gcd(numerator, denominator);
  const simplestInput = inputGcd === BIGINT_ONE && denominator > BIGINT_ZERO;
  numerator /= inputGcd;
  denominator /= inputGcd;
  if (denominator < BIGINT_ZERO) {
    numerator = -numerator;
    denominator = -denominator;
  }
  return {
    numerator,
    denominator,
    normalized: `${numerator}/${denominator}`,
    simplestInput,
  };
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function gradeAnswer(answerText: string, answerSpec: AnswerSpec): AttemptGrade {
  switch (answerSpec.kind) {
    case 'INTEGER': {
      const actual = normalizeInteger(answerText);
      const expected = normalizeInteger(answerSpec.value);
      if (!expected) throw new Error('trusted integer answer spec is invalid');
      return result(actual !== undefined && actual === expected, actual ?? answerText.trim());
    }
    case 'DECIMAL': {
      const actual = normalizeDecimal(answerText);
      const expected = normalizeDecimal(answerSpec.value);
      if (!expected) throw new Error('trusted decimal answer spec is invalid');
      return result(actual !== undefined && actual === expected, actual ?? answerText.trim());
    }
    case 'FRACTION': {
      const actual = parseFraction(answerText);
      const expected = parseFraction(`${answerSpec.numerator}/${answerSpec.denominator}`);
      if (!expected) throw new Error('trusted fraction answer spec is invalid');
      const equal = actual !== undefined
        && actual.numerator === expected.numerator
        && actual.denominator === expected.denominator;
      const correct = equal && (answerSpec.equivalence === 'VALUE' || actual!.simplestInput);
      return result(correct, actual?.normalized ?? answerText.trim());
    }
    case 'CHOICE': {
      const actual = answerText.trim();
      return result(actual === answerSpec.optionId, actual);
    }
    case 'EXACT_TEXT': {
      const actual = normalizeText(answerText);
      const accepted = answerSpec.acceptedValues.map(normalizeText);
      return result(accepted.includes(actual), actual);
    }
  }
}
