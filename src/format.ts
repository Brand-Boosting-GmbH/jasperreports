/**
 * Value formatting helpers for JasperReports `pattern` attributes.
 *
 * JasperReports uses `java.text.DecimalFormat` (numbers) and
 * `java.text.SimpleDateFormat` (dates) under the hood. This file implements a
 * practical subset that covers the overwhelming majority of real templates
 * without pulling in a heavyweight dependency.
 */

/**
 * Try to format a value according to a JasperReports pattern.
 * Falls back to `String(value)` if the value isn't a recognisable number/date
 * or the pattern is unsupported.
 */
export function formatPattern(value: unknown, pattern: string | undefined): string {
  if (value === null || value === undefined) return '';
  if (!pattern) return String(value);

  const date = toDate(value);
  if (date && looksLikeDatePattern(pattern)) {
    return formatDate(date, pattern);
  }

  const num = toNumber(value);
  if (num !== null && looksLikeNumberPattern(pattern)) {
    return formatNumber(num, pattern);
  }

  return String(value);
}

// ---------------------------------------------------------------------------
// Type coercion
// ---------------------------------------------------------------------------

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Treat small numbers (< 10^10) as seconds, large as ms. Only use ms
    // timestamps to avoid false positives with small integer counters.
    if (value > 1e11) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  }
  if (typeof value === 'string') {
    // ISO-ish strings only; we don't want to accidentally parse "12" as a date.
    if (/^\d{4}-\d{2}-\d{2}/.test(value) || /^\d{4}\/\d{2}\/\d{2}/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Number patterns (DecimalFormat subset)
// ---------------------------------------------------------------------------

function looksLikeNumberPattern(pattern: string): boolean {
  return /[0#]/.test(pattern);
}

/**
 * Very small DecimalFormat subset. Understands:
 *  - `0`   — required digit (zero-padded)
 *  - `#`   — optional digit
 *  - `.`   — decimal separator
 *  - `,`   — grouping separator (presence anywhere left of `.` enables grouping)
 *  - `%`   — percent (multiplies by 100 and appends `%`)
 *  - `‰`   — per-mille (multiplies by 1000 and appends `‰`)
 *  - literal prefix/suffix characters (e.g. `€`, `$`, `CHF `)
 *
 * Does not implement: multiple sub-patterns separated by `;` (negative pattern),
 * rounding modes, currency symbol `¤`, significant digits.
 */
export function formatNumber(value: number, pattern: string): string {
  if (!Number.isFinite(value)) return String(value);

  // Detect scaling tokens.
  let scaled = value;
  let suffix = '';
  let prefix = '';

  // Strip quoted literals and capture prefix/suffix around the number template.
  const match = pattern.match(/^([^0#.,%‰]*)([0#.,]+)([^0#.,]*)$/);
  let numberPart = pattern;
  if (match) {
    prefix = match[1];
    numberPart = match[2];
    suffix = match[3];
  }

  if (pattern.includes('%')) {
    scaled = value * 100;
    if (!suffix.includes('%')) suffix += '%';
  } else if (pattern.includes('‰')) {
    scaled = value * 1000;
    if (!suffix.includes('‰')) suffix += '‰';
  }

  const [intPart, fracPart = ''] = numberPart.split('.');
  const minFrac = (fracPart.match(/0/g) ?? []).length;
  const maxFrac = fracPart.length;
  const useGrouping = intPart.includes(',');
  const minInt = (intPart.replace(/,/g, '').match(/0/g) ?? []).length;

  const formatted = scaled.toLocaleString('en-US', {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
    minimumIntegerDigits: Math.max(minInt, 1),
    useGrouping,
  });

  return prefix + formatted + suffix;
}

// ---------------------------------------------------------------------------
// Date patterns (SimpleDateFormat subset)
// ---------------------------------------------------------------------------

function looksLikeDatePattern(pattern: string): boolean {
  return /[yMdHhmsSaEw]/.test(pattern);
}

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3));
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = DAYS_LONG.map((d) => d.slice(0, 3));

/**
 * SimpleDateFormat subset. Understands tokens:
 *   y/yy/yyyy, M/MM/MMM/MMMM, d/dd, H/HH (24h), h/hh (12h), m/mm, s/ss,
 *   S/SSS (millis), a (AM/PM), E/EEE/EEEE (weekday).
 * Characters inside single quotes are literal; `''` is a literal quote.
 */
export function formatDate(date: Date, pattern: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];

    // Quoted literal
    if (ch === "'") {
      i++;
      if (pattern[i] === "'") {
        out.push("'");
        i++;
        continue;
      }
      while (i < pattern.length && pattern[i] !== "'") {
        out.push(pattern[i]);
        i++;
      }
      i++; // skip closing quote
      continue;
    }

    // Run of same token character
    if (/[A-Za-z]/.test(ch)) {
      let run = ch;
      while (pattern[i + run.length] === ch) run += ch;
      out.push(formatDateToken(date, run));
      i += run.length;
      continue;
    }

    out.push(ch);
    i++;
  }
  return out.join('');
}

function formatDateToken(d: Date, token: string): string {
  const ch = token[0];
  const len = token.length;

  switch (ch) {
    case 'y': {
      const y = d.getFullYear();
      if (len === 2) return pad(y % 100, 2);
      return pad(y, len);
    }
    case 'M': {
      const m = d.getMonth();
      if (len >= 4) return MONTHS_LONG[m];
      if (len === 3) return MONTHS_SHORT[m];
      return pad(m + 1, len);
    }
    case 'd': return pad(d.getDate(), len);
    case 'H': return pad(d.getHours(), len);
    case 'h': {
      const hr = d.getHours() % 12;
      return pad(hr === 0 ? 12 : hr, len);
    }
    case 'm': return pad(d.getMinutes(), len);
    case 's': return pad(d.getSeconds(), len);
    case 'S': return pad(d.getMilliseconds(), len);
    case 'a': return d.getHours() < 12 ? 'AM' : 'PM';
    case 'E': {
      const w = d.getDay();
      if (len >= 4) return DAYS_LONG[w];
      return DAYS_SHORT[w];
    }
    default: return token;
  }
}

function pad(n: number, width: number): string {
  const s = String(n);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

// ---------------------------------------------------------------------------
// printWhenExpression evaluation
// ---------------------------------------------------------------------------

/**
 * Decide whether a `printWhenExpression` result should cause the element to be
 * rendered. Accepts the already-evaluated expression value (any type).
 */
export function isTruthyPrintWhen(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === '' || s === 'false' || s === '0' || s === 'null' || s === 'undefined') return false;
    return true;
  }
  return Boolean(value);
}
