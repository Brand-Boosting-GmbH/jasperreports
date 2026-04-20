import { describe, it, expect } from 'vitest';
import { ExpressionEvaluator } from './expression';

const ev = (expr: string, fields: Record<string, unknown> = {}, params: Record<string, unknown> = {}, vars: Record<string, unknown> = {}) =>
  new ExpressionEvaluator(fields, params, vars).evaluate(expr);

describe('ExpressionEvaluator - literals', () => {
  it('parses strings', () => expect(ev('"hello"')).toBe('hello'));
  it('parses numbers', () => expect(ev('42')).toBe(42));
  it('parses decimals', () => expect(ev('3.14')).toBe(3.14));
  it('parses booleans', () => expect(ev('true')).toBe(true));
  it('parses null', () => expect(ev('null')).toBe(null));
  it('strips Java number suffixes', () => expect(ev('10L')).toBe(10));
});

describe('ExpressionEvaluator - references', () => {
  it('resolves fields', () => expect(ev('$F{name}', { name: 'Alice' })).toBe('Alice'));
  it('resolves parameters', () => expect(ev('$P{max}', {}, { max: 100 })).toBe(100));
  it('resolves variables', () => expect(ev('$V{total}', {}, {}, { total: 7 })).toBe(7));
  it('returns null for unknown refs', () => expect(ev('$F{missing}')).toBe(null));
});

describe('ExpressionEvaluator - arithmetic', () => {
  it('adds numbers', () => expect(ev('1 + 2')).toBe(3));
  it('respects precedence', () => expect(ev('1 + 2 * 3')).toBe(7));
  it('honors grouping', () => expect(ev('(1 + 2) * 3')).toBe(9));
  it('subtracts', () => expect(ev('10 - 4')).toBe(6));
  it('divides', () => expect(ev('15 / 3')).toBe(5));
  it('modulos', () => expect(ev('10 % 3')).toBe(1));
  it('negates', () => expect(ev('-5 + 2')).toBe(-3));
  it('concatenates strings', () => expect(ev('"a" + "b"')).toBe('ab'));
  it('coerces when mixing string and number', () => expect(ev('"n=" + 5')).toBe('n=5'));
  it('uses field values', () => expect(ev('$F{a} + $F{b}', { a: 10, b: 20 })).toBe(30));
});

describe('ExpressionEvaluator - comparison and logic', () => {
  it('==', () => expect(ev('1 == 1')).toBe(true));
  it('!=', () => expect(ev('1 != 2')).toBe(true));
  it('<', () => expect(ev('1 < 2')).toBe(true));
  it('>=', () => expect(ev('5 >= 5')).toBe(true));
  it('&&', () => expect(ev('true && false')).toBe(false));
  it('||', () => expect(ev('false || true')).toBe(true));
  it('! negation', () => expect(ev('!false')).toBe(true));
  it('short-circuits &&', () => expect(ev('$F{x} != null && $F{x} > 0', { x: null })).toBe(false));
});

describe('ExpressionEvaluator - ternary', () => {
  it('picks consequent', () => expect(ev('true ? "yes" : "no"')).toBe('yes'));
  it('picks alternate', () => expect(ev('false ? "yes" : "no"')).toBe('no'));
  it('uses field in condition', () =>
    expect(ev('$F{n} > 0 ? "positive" : "non-positive"', { n: 5 })).toBe('positive'));
});

describe('ExpressionEvaluator - method shims', () => {
  it('String.toUpperCase', () => expect(ev('$F{s}.toUpperCase()', { s: 'hi' })).toBe('HI'));
  it('String.substring(begin,end)', () =>
    expect(ev('$F{s}.substring(0, 3)', { s: 'hello' })).toBe('hel'));
  it('String.startsWith', () =>
    expect(ev('$F{s}.startsWith("he")', { s: 'hello' })).toBe(true));
  it('String.replace', () =>
    expect(ev('$F{s}.replace("l", "L")', { s: 'hello' })).toBe('heLLo'));
  it('Number.toFixed', () => expect(ev('$F{n}.toFixed(2)', { n: 3.14159 })).toBe('3.14'));
});

describe('ExpressionEvaluator - constructors', () => {
  it('new SimpleDateFormat().format(date)', () => {
    const d = new Date(2024, 0, 15);
    const out = ev('new SimpleDateFormat("yyyy-MM-dd").format($F{d})', { d });
    expect(out).toBe('2024-01-15');
  });
  it('new Integer(x)', () => expect(ev('new Integer("42")')).toBe(42));
  it('new Boolean(x)', () => expect(ev('new Boolean("true")')).toBe(true));
});

describe('ExpressionEvaluator - fallback', () => {
  it('returns source on parse error', () => {
    const result = ev('this is not valid @@#');
    expect(typeof result).toBe('string');
  });
});
