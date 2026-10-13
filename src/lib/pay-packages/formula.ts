/**
 * A small, safe formula language for pay components. Numbers, variables, + - * / %, comparisons, && || !,
 * a ? b : c, and the functions min, max, round, floor, ceil, abs, if. Nothing is ever run as code: the text is
 * parsed into a tree and worked out by this file alone.
 */

export class FormulaError extends Error {}

type Token =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'end' };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const text = src.slice(i, j);
      if (!/^\d*\.?\d+$|^\d+\.?$/.test(text)) throw new FormulaError(`"${text}" is not a number`);
      out.push({ t: 'num', v: parseFloat(text) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/%()<>!?:,'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new FormulaError(`Unexpected "${c}"`);
  }
  out.push({ t: 'end' });
  return out;
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'var'; name: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'cond'; c: Node; a: Node; b: Node }
  | { k: 'call'; fn: string; args: Node[] };

const FUNCTIONS: Record<string, { min: number; max: number; run: (a: number[]) => number }> = {
  min: { min: 1, max: 8, run: (a) => Math.min(...a) },
  max: { min: 1, max: 8, run: (a) => Math.max(...a) },
  round: { min: 1, max: 1, run: (a) => Math.round(a[0]) },
  floor: { min: 1, max: 1, run: (a) => Math.floor(a[0]) },
  ceil: { min: 1, max: 1, run: (a) => Math.ceil(a[0]) },
  abs: { min: 1, max: 1, run: (a) => Math.abs(a[0]) },
  if: { min: 3, max: 3, run: (a) => (a[0] !== 0 ? a[1] : a[2]) },
};

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token { return this.tokens[this.pos]; }
  private next(): Token { return this.tokens[this.pos++]; }
  private isOp(v: string) { const t = this.peek(); return t.t === 'op' && t.v === v; }
  private eat(v: string) {
    if (!this.isOp(v)) throw new FormulaError(`Expected "${v}"`);
    this.pos++;
  }

  parse(): Node {
    const n = this.ternary();
    if (this.peek().t !== 'end') throw new FormulaError('Something is left over at the end of the formula');
    return n;
  }

  private ternary(): Node {
    const c = this.or();
    if (this.isOp('?')) {
      this.pos++;
      const a = this.ternary();
      this.eat(':');
      const b = this.ternary();
      return { k: 'cond', c, a, b };
    }
    return c;
  }

  private binary(next: () => Node, ops: string[]): Node {
    let left = next();
    while (this.peek().t === 'op' && ops.includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      left = { k: 'bin', op, a: left, b: next() };
    }
    return left;
  }

  private or(): Node { return this.binary(() => this.and(), ['||']); }
  private and(): Node { return this.binary(() => this.equality(), ['&&']); }
  private equality(): Node { return this.binary(() => this.compare(), ['==', '!=']); }
  private compare(): Node { return this.binary(() => this.sum(), ['<', '>', '<=', '>=']); }
  private sum(): Node { return this.binary(() => this.product(), ['+', '-']); }
  private product(): Node { return this.binary(() => this.unary(), ['*', '/', '%']); }

  private unary(): Node {
    if (this.isOp('-') || this.isOp('!')) {
      const op = (this.next() as { v: string }).v;
      return { k: 'un', op, a: this.unary() };
    }
    return this.primary();
  }

  private primary(): Node {
    const t = this.next();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'id') {
      if (this.isOp('(')) {
        const fn = FUNCTIONS[t.v];
        if (!fn) throw new FormulaError(`There is no function called "${t.v}"`);
        this.pos++;
        const args: Node[] = [];
        if (!this.isOp(')')) {
          args.push(this.ternary());
          while (this.isOp(',')) { this.pos++; args.push(this.ternary()); }
        }
        this.eat(')');
        if (args.length < fn.min || args.length > fn.max) throw new FormulaError(`${t.v}() takes ${fn.min === fn.max ? fn.min : `${fn.min} to ${fn.max}`} values`);
        return { k: 'call', fn: t.v, args };
      }
      return { k: 'var', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      const n = this.ternary();
      this.eat(')');
      return n;
    }
    throw new FormulaError(t.t === 'end' ? 'The formula ends too soon' : `Unexpected "${(t as { v: string | number }).v}"`);
  }
}

export function parseFormula(src: string): Node {
  if (!src || !src.trim()) throw new FormulaError('The formula is empty');
  return new Parser(tokenize(src)).parse();
}

function run(node: Node, vars: Record<string, number>): number {
  switch (node.k) {
    case 'num': return node.v;
    case 'var': {
      if (!(node.name in vars)) throw new FormulaError(`There is no value called "${node.name}"`);
      return vars[node.name];
    }
    case 'un': {
      const a = run(node.a, vars);
      return node.op === '-' ? -a : a === 0 ? 1 : 0;
    }
    case 'cond': return run(node.c, vars) !== 0 ? run(node.a, vars) : run(node.b, vars);
    case 'call': return FUNCTIONS[node.fn].run(node.args.map((a) => run(a, vars)));
    case 'bin': {
      const a = run(node.a, vars);
      // && and || only look at the right side when they need to.
      if (node.op === '&&') return a !== 0 && run(node.b, vars) !== 0 ? 1 : 0;
      if (node.op === '||') return a !== 0 || run(node.b, vars) !== 0 ? 1 : 0;
      const b = run(node.b, vars);
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': if (b === 0) throw new FormulaError('Divides by zero'); return a / b;
        case '%': if (b === 0) throw new FormulaError('Divides by zero'); return a % b;
        case '<': return a < b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
      }
    }
  }
  throw new FormulaError('Could not work out the formula');
}

/** Works a formula out. Throws a FormulaError, in plain words, when it cannot. */
export function evaluateFormula(src: string, vars: Record<string, number>): number {
  const result = run(parseFormula(src), vars);
  if (!Number.isFinite(result)) throw new FormulaError('The result is not a number');
  return result;
}

/** Null when the formula is usable, otherwise what is wrong with it. */
export function checkFormula(src: string, names: string[]): string | null {
  try {
    const vars: Record<string, number> = {};
    for (const n of names) vars[n] = 1;
    // Division by a variable is fine; only a literal zero divide is caught here, with variables set to 1.
    evaluateFormula(src, vars);
    return null;
  } catch (err) {
    return err instanceof FormulaError ? err.message : 'The formula could not be read';
  }
}
