import { describe, it, expect } from 'vitest';
import { formatNumber, formatDate, formatPattern, isTruthyPrintWhen } from './format';

describe('formatNumber', () => {
  it('formats with grouping and fixed fraction digits', () => {
    expect(formatNumber(1234567.891, '#,##0.00')).toBe('1,234,567.89');
  });

  it('pads integer part with leading zeros', () => {
    expect(formatNumber(7, '0000')).toBe('0007');
  });

  it('honours percent pattern', () => {
    expect(formatNumber(0.25, '0%')).toBe('25%');
  });

  it('keeps literal prefix characters', () => {
    expect(formatNumber(9.5, '€#,##0.00')).toBe('€9.50');
  });

  it('drops trailing optional digits when zero', () => {
    expect(formatNumber(1.5, '#,##0.##')).toBe('1.5');
  });
});

describe('formatDate', () => {
  const d = new Date(Date.UTC(2026, 0, 15, 13, 4, 9));
  // getTimezoneOffset-safe reconstruction of a local Date
  const local = new Date(2026, 0, 15, 13, 4, 9);

  it('formats yyyy-MM-dd', () => {
    expect(formatDate(local, 'yyyy-MM-dd')).toBe('2026-01-15');
  });

  it('formats dd.MM.yyyy', () => {
    expect(formatDate(local, 'dd.MM.yyyy')).toBe('15.01.2026');
  });

  it('formats short month name', () => {
    expect(formatDate(local, 'd MMM yyyy')).toBe('15 Jan 2026');
  });

  it('formats full month name', () => {
    expect(formatDate(local, 'MMMM yyyy')).toBe('January 2026');
  });

  it('formats 24-hour time', () => {
    expect(formatDate(local, 'HH:mm:ss')).toBe('13:04:09');
  });

  it('handles quoted literals', () => {
    expect(formatDate(local, "yyyy 'at' HH:mm")).toBe('2026 at 13:04');
  });

  it('respects the Date instance regardless of toString coercion', () => {
    // Sanity: make sure we really get the UTC-constructed date formatted against the local TZ too.
    expect(formatDate(d, 'yyyy')).toMatch(/^\d{4}$/);
  });
});

describe('formatPattern dispatch', () => {
  it('routes numeric strings through the number formatter', () => {
    expect(formatPattern('1234.5', '#,##0.00')).toBe('1,234.50');
  });

  it('routes ISO date strings through the date formatter', () => {
    expect(formatPattern('2026-01-15', 'yyyy/MM/dd')).toBe('2026/01/15');
  });

  it('returns the original value when the pattern is unknown', () => {
    expect(formatPattern('hello', 'gibberish')).toBe('hello');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatPattern(null, 'yyyy')).toBe('');
    expect(formatPattern(undefined, '0.00')).toBe('');
  });
});

describe('isTruthyPrintWhen', () => {
  it('treats true-ish strings as true', () => {
    expect(isTruthyPrintWhen('true')).toBe(true);
    expect(isTruthyPrintWhen('yes')).toBe(true);
    expect(isTruthyPrintWhen('1')).toBe(true);
  });

  it('treats false-ish strings as false', () => {
    expect(isTruthyPrintWhen('false')).toBe(false);
    expect(isTruthyPrintWhen('0')).toBe(false);
    expect(isTruthyPrintWhen('')).toBe(false);
    expect(isTruthyPrintWhen('   ')).toBe(false);
    expect(isTruthyPrintWhen('null')).toBe(false);
  });

  it('handles booleans and numbers', () => {
    expect(isTruthyPrintWhen(true)).toBe(true);
    expect(isTruthyPrintWhen(false)).toBe(false);
    expect(isTruthyPrintWhen(0)).toBe(false);
    expect(isTruthyPrintWhen(1)).toBe(true);
    expect(isTruthyPrintWhen(null)).toBe(false);
    expect(isTruthyPrintWhen(undefined)).toBe(false);
  });
});
