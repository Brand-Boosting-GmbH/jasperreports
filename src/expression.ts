/**
 * JRXML Expression Evaluator
 *
 * Recursive-descent parser + evaluator for JasperReports expressions.
 */

import { formatDate } from './format';

export class ExpressionEvaluator {
  private fields: Record<string, unknown>;
  private parameters: Record<string, unknown>;
  private variables: Record<string, unknown>;
  private resources: Record<string, unknown>;
  private debug: boolean;

  constructor(
    fields: Record<string, unknown> = {},
    parameters: Record<string, unknown> = {},
    variables: Record<string, unknown> = {},
    debug = false,
    resources: Record<string, unknown> = {},
  ) {
    this.fields = fields;
    this.parameters = parameters;
    this.variables = variables;
    this.resources = resources;
    this.debug = debug;
  }

  setFields(fields: Record<string, unknown>): void {
    this.fields = { ...this.fields, ...fields };
  }
  setParameters(parameters: Record<string, unknown>): void {
    this.parameters = { ...this.parameters, ...parameters };
  }
  setVariables(variables: Record<string, unknown>): void {
    this.variables = { ...this.variables, ...variables };
  }

  evaluate(expression: string): unknown {
    if (!expression) return '';
    const src = expression.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim();
    if (!src) return '';
    if (this.debug) console.log('[ExpressionEvaluator] Evaluating:', src);

    try {
      const tokens = tokenize(src);
      const parser = new Parser(tokens);
      const ast = parser.parseExpression();
      parser.expectEnd();
      const result = this.evalNode(ast);
      if (this.debug) console.log('[ExpressionEvaluator] =>', result);
      return result;
    } catch (err) {
      if (this.debug) console.log('[ExpressionEvaluator] Fallback (parse error):', err);
      return src;
    }
  }

  private evalNode(node: Node): unknown {
    switch (node.type) {
      case 'Literal': return node.value;
      case 'Reference': return this.resolveReference(node.kind, node.name);
      case 'Unary': return applyUnary(node.operator, this.evalNode(node.argument));
      case 'Binary': {
        if (node.operator === '&&') {
          const left = this.evalNode(node.left);
          return truthy(left) ? this.evalNode(node.right) : left;
        }
        if (node.operator === '||') {
          const left = this.evalNode(node.left);
          return truthy(left) ? left : this.evalNode(node.right);
        }
        return applyBinary(node.operator, this.evalNode(node.left), this.evalNode(node.right));
      }
      case 'Ternary':
        return truthy(this.evalNode(node.test))
          ? this.evalNode(node.consequent)
          : this.evalNode(node.alternate);
      case 'Call': {
        const args = node.arguments.map((a) => this.evalNode(a));
        if (node.callee.type === 'Member') {
          return applyMethod(this.evalNode(node.callee.object), node.callee.property, args);
        }
        throw new Error(`Unsupported call target: ${node.callee.type}`);
      }
      case 'Member': {
        const obj = this.evalNode(node.object);
        return (obj as Record<string, unknown> | null)?.[node.property] ?? null;
      }
      case 'New':
        return constructBuiltin(node.className, node.arguments.map((a) => this.evalNode(a)));
      case 'Identifier':
        return null;
    }
  }

  private resolveReference(kind: 'F' | 'P' | 'V' | 'R', name: string): unknown {
    const map =
      kind === 'F' ? this.fields :
      kind === 'P' ? this.parameters :
      kind === 'V' ? this.variables :
      this.resources;
    return name in map ? map[name] : null;
  }
}

// Runtime helpers ---------------------------------------------------------

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s !== '' && s !== 'false' && s !== '0' && s !== 'null';
  }
  return Boolean(v);
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return Number(v);
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toString();
  return String(v);
}

function applyUnary(op: string, v: unknown): unknown {
  if (op === '-') return -toNum(v);
  if (op === '+') return +toNum(v);
  if (op === '!') return !truthy(v);
  throw new Error(`Unknown unary operator ${op}`);
}

function applyBinary(op: string, l: unknown, r: unknown): unknown {
  switch (op) {
    case '+':
      if (typeof l === 'string' || typeof r === 'string') return stringify(l) + stringify(r);
      return toNum(l) + toNum(r);
    case '-': return toNum(l) - toNum(r);
    case '*': return toNum(l) * toNum(r);
    case '/': return toNum(l) / toNum(r);
    case '%': return toNum(l) % toNum(r);
    case '==': return looseEq(l, r);
    case '!=': return !looseEq(l, r);
    case '<': return toNum(l) < toNum(r);
    case '>': return toNum(l) > toNum(r);
    case '<=': return toNum(l) <= toNum(r);
    case '>=': return toNum(l) >= toNum(r);
  }
  throw new Error(`Unknown binary operator ${op}`);
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (typeof a === typeof b) return a === b;
  if (typeof a === 'number' || typeof b === 'number') return toNum(a) === toNum(b);
  return String(a) === String(b);
}

function coerceDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

interface SimpleDateFormatInstance {
  readonly __type: 'SimpleDateFormat';
  readonly __pattern: string;
}

function isSimpleDateFormat(v: unknown): v is SimpleDateFormatInstance {
  return !!v && typeof v === 'object' && (v as { __type?: string }).__type === 'SimpleDateFormat';
}

function applyMethod(receiver: unknown, method: string, args: unknown[]): unknown {
  if (receiver === null || receiver === undefined) return null;

  if (isSimpleDateFormat(receiver) && method === 'format') {
    const d = coerceDate(args[0]);
    return d ? formatDate(d, receiver.__pattern) : '';
  }

  if (receiver instanceof Date) {
    switch (method) {
      case 'getTime': return receiver.getTime();
      case 'getFullYear': return receiver.getFullYear();
      case 'getMonth': return receiver.getMonth();
      case 'getDate': return receiver.getDate();
      case 'getHours': return receiver.getHours();
      case 'getMinutes': return receiver.getMinutes();
      case 'getSeconds': return receiver.getSeconds();
      case 'toString': return receiver.toString();
      case 'format': return formatDate(receiver, String(args[0] ?? ''));
      case 'equals': return coerceDate(args[0])?.getTime() === receiver.getTime();
    }
  }

  if (typeof receiver === 'string') {
    switch (method) {
      case 'toUpperCase': return receiver.toUpperCase();
      case 'toLowerCase': return receiver.toLowerCase();
      case 'trim': return receiver.trim();
      case 'length': return receiver.length;
      case 'substring': {
        const start = Number(args[0] ?? 0);
        const end = args.length > 1 ? Number(args[1]) : undefined;
        return end === undefined ? receiver.substring(start) : receiver.substring(start, end);
      }
      case 'startsWith': return receiver.startsWith(String(args[0] ?? ''));
      case 'endsWith': return receiver.endsWith(String(args[0] ?? ''));
      case 'indexOf': return receiver.indexOf(String(args[0] ?? ''));
      case 'replace': return receiver.split(String(args[0] ?? '')).join(String(args[1] ?? ''));
      case 'replaceAll': {
        const pattern = String(args[0] ?? '');
        const replacement = String(args[1] ?? '');
        try { return receiver.replace(new RegExp(pattern, 'g'), replacement); }
        catch { return receiver.split(pattern).join(replacement); }
      }
      case 'concat': return receiver + stringify(args[0]);
      case 'charAt': return receiver.charAt(Number(args[0] ?? 0));
      case 'split': return receiver.split(String(args[0] ?? ''));
      case 'equals': return receiver === stringify(args[0]);
      case 'equalsIgnoreCase': return receiver.toLowerCase() === stringify(args[0]).toLowerCase();
      case 'toString': return receiver;
      case 'isEmpty': return receiver.length === 0;
    }
  }

  if (typeof receiver === 'number') {
    switch (method) {
      case 'toString': return args[0] !== undefined ? receiver.toString(Number(args[0])) : receiver.toString();
      case 'toFixed': return receiver.toFixed(Number(args[0] ?? 0));
      case 'intValue':
      case 'longValue': return Math.trunc(receiver);
      case 'doubleValue':
      case 'floatValue': return receiver;
      case 'equals': return receiver === toNum(args[0]);
    }
  }

  if (typeof receiver === 'boolean') {
    if (method === 'toString') return String(receiver);
    if (method === 'booleanValue') return receiver;
  }

  return null;
}

function constructBuiltin(className: string, args: unknown[]): unknown {
  const bare = className.split('.').pop() ?? className;
  switch (bare) {
    case 'SimpleDateFormat': {
      const inst: SimpleDateFormatInstance = { __type: 'SimpleDateFormat', __pattern: String(args[0] ?? '') };
      return inst;
    }
    case 'Date': {
      if (args.length === 0) return new Date();
      if (args.length === 1) {
        const a = args[0];
        if (typeof a === 'number') return new Date(a);
        return coerceDate(a) ?? new Date(NaN);
      }
      const [y, m = 0, d = 1, h = 0, mi = 0, s = 0, ms = 0] = args.map((x) => Number(x));
      return new Date(y, m, d, h, mi, s, ms);
    }
    case 'String': return stringify(args[0]);
    case 'Integer':
    case 'Long': return Math.trunc(toNum(args[0]));
    case 'Double':
    case 'Float':
    case 'BigDecimal': return toNum(args[0]);
    case 'Boolean': return truthy(args[0]);
    default: return null;
  }
}

// Tokenizer ---------------------------------------------------------------

type TokenType = 'number' | 'string' | 'ident' | 'ref' | 'op' | 'punct' | 'eof';

interface Token {
  type: TokenType;
  value: string;
  kind?: 'F' | 'P' | 'V' | 'R';
  name?: string;
  numValue?: number;
}

const MULTI_CHAR_OPS = ['==', '!=', '<=', '>=', '&&', '||'];
const SINGLE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '<', '>', '!', '=']);
const PUNCT = new Set(['(', ')', ',', '.', '?', ':', ';']);

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;

  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }

    if (c === '$' && i + 2 < n && /[FPVR]/.test(src[i + 1]) && src[i + 2] === '{') {
      const kind = src[i + 1] as 'F' | 'P' | 'V' | 'R';
      const end = src.indexOf('}', i + 3);
      if (end === -1) throw new Error(`Unclosed $${kind}{ at ${i}`);
      const name = src.substring(i + 3, end);
      out.push({ type: 'ref', value: `$${kind}{${name}}`, kind, name });
      i = end + 1;
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let value = '';
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < n) {
          const next = src[j + 1];
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next;
          j += 2;
        } else {
          value += src[j];
          j++;
        }
      }
      if (j >= n) throw new Error(`Unterminated string at ${i}`);
      out.push({ type: 'string', value });
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < n && /[0-9.]/.test(src[j])) j++;
      if (src[j] === 'e' || src[j] === 'E') {
        j++;
        if (src[j] === '+' || src[j] === '-') j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      if (/[LlFfDd]/.test(src[j] ?? '')) j++;
      const raw = src.substring(i, j).replace(/[LlFfDd]$/, '');
      out.push({ type: 'number', value: raw, numValue: Number(raw) });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ type: 'ident', value: src.substring(i, j) });
      i = j;
      continue;
    }

    const two = src.substring(i, i + 2);
    if (MULTI_CHAR_OPS.includes(two)) { out.push({ type: 'op', value: two }); i += 2; continue; }
    if (SINGLE_CHAR_OPS.has(c)) { out.push({ type: 'op', value: c }); i++; continue; }
    if (PUNCT.has(c)) { out.push({ type: 'punct', value: c }); i++; continue; }

    throw new Error(`Unexpected character '${c}' at ${i}`);
  }

  out.push({ type: 'eof', value: '' });
  return out;
}

// Parser ------------------------------------------------------------------

type Node =
  | { type: 'Literal'; value: unknown }
  | { type: 'Reference'; kind: 'F' | 'P' | 'V' | 'R'; name: string }
  | { type: 'Identifier'; name: string }
  | { type: 'Unary'; operator: string; argument: Node }
  | { type: 'Binary'; operator: string; left: Node; right: Node }
  | { type: 'Ternary'; test: Node; consequent: Node; alternate: Node }
  | { type: 'Member'; object: Node; property: string }
  | { type: 'Call'; callee: Node; arguments: Node[] }
  | { type: 'New'; className: string; arguments: Node[] };

const PRECEDENCE: Record<string, number> = {
  '||': 1, '&&': 2,
  '==': 3, '!=': 3,
  '<': 4, '>': 4, '<=': 4, '>=': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
};

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(offset = 0): Token { return this.tokens[this.pos + offset]; }
  private consume(): Token { return this.tokens[this.pos++]; }

  private match(type: TokenType, value?: string): boolean {
    const t = this.peek();
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    this.pos++;
    return true;
  }

  private expect(type: TokenType, value?: string): Token {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${value ?? type} but got ${t.type} '${t.value}'`);
    }
    return this.consume();
  }

  expectEnd(): void {
    if (this.peek().type !== 'eof') {
      throw new Error(`Unexpected trailing token '${this.peek().value}'`);
    }
  }

  parseExpression(): Node {
    return this.parseTernary();
  }

  private parseTernary(): Node {
    const test = this.parseBinary(0);
    if (this.match('punct', '?')) {
      const consequent = this.parseExpression();
      this.expect('punct', ':');
      const alternate = this.parseExpression();
      return { type: 'Ternary', test, consequent, alternate };
    }
    return test;
  }

  private parseBinary(minPrec: number): Node {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (t.type !== 'op' || !(t.value in PRECEDENCE)) break;
      const prec = PRECEDENCE[t.value];
      if (prec < minPrec) break;
      this.consume();
      const right = this.parseBinary(prec + 1);
      left = { type: 'Binary', operator: t.value, left, right };
    }
    return left;
  }

  private parseUnary(): Node {
    const t = this.peek();
    if (t.type === 'op' && (t.value === '-' || t.value === '+' || t.value === '!')) {
      this.consume();
      return { type: 'Unary', operator: t.value, argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Node {
    let node = this.parsePrimary();
    while (true) {
      if (this.match('punct', '.')) {
        const id = this.expect('ident');
        if (this.match('punct', '(')) {
          const args = this.parseArgList();
          node = { type: 'Call', callee: { type: 'Member', object: node, property: id.value }, arguments: args };
        } else {
          node = { type: 'Member', object: node, property: id.value };
        }
      } else {
        break;
      }
    }
    return node;
  }

  private parseArgList(): Node[] {
    const args: Node[] = [];
    if (this.match('punct', ')')) return args;
    args.push(this.parseExpression());
    while (this.match('punct', ',')) args.push(this.parseExpression());
    this.expect('punct', ')');
    return args;
  }

  private parsePrimary(): Node {
    const t = this.peek();

    if (t.type === 'number') {
      this.consume();
      return { type: 'Literal', value: t.numValue ?? Number(t.value) };
    }
    if (t.type === 'string') {
      this.consume();
      return { type: 'Literal', value: t.value };
    }
    if (t.type === 'ref') {
      this.consume();
      return { type: 'Reference', kind: t.kind!, name: t.name! };
    }
    if (t.type === 'punct' && t.value === '(') {
      this.consume();
      const inner = this.parseExpression();
      this.expect('punct', ')');
      return inner;
    }
    if (t.type === 'ident') {
      this.consume();
      if (t.value === 'true') return { type: 'Literal', value: true };
      if (t.value === 'false') return { type: 'Literal', value: false };
      if (t.value === 'null') return { type: 'Literal', value: null };
      if (t.value === 'new') return this.parseNew();
      return { type: 'Identifier', name: t.value };
    }

    throw new Error(`Unexpected token '${t.value}'`);
  }

  private parseNew(): Node {
    let className = this.expect('ident').value;
    while (this.match('punct', '.')) {
      className += '.' + this.expect('ident').value;
    }
    this.expect('punct', '(');
    const args = this.parseArgList();
    return { type: 'New', className, arguments: args };
  }
}
