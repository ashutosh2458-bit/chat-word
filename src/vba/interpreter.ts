import { Parser, Expression, Statement } from "./parser";

export type MacroValue = number | string | boolean | null;
export interface MacroResult {
  output: string[];
  variables: Record<string, MacroValue>;
  steps: number;
}

export class MacroRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MacroRuntimeError";
  }
}

export class VbaInterpreter {
  private readonly variables = new Map<string, MacroValue>();
  private readonly output: string[] = [];
  private steps = 0;
  private readonly maxSteps: number;

  constructor(maxSteps = 10_000) {
    this.maxSteps = Math.max(100, Math.min(maxSteps, 100_000));
  }

  run(source: string): MacroResult {
    this.variables.clear();
    this.output.length = 0;
    this.steps = 0;
    this.executeBlock(new Parser(source).parse());
    return { output: [...this.output], variables: Object.fromEntries(this.variables), steps: this.steps };
  }

  private tick(): void {
    this.steps += 1;
    if (this.steps > this.maxSteps) {
      throw new MacroRuntimeError(`Macro stopped: execution exceeded the ${this.maxSteps}-step limit`);
    }
  }

  private executeBlock(statements: Statement[]): void {
    for (const statement of statements) this.execute(statement);
  }

  private execute(statement: Statement): void {
    this.tick();
    switch (statement.kind) {
      case "dim":
        for (const name of statement.names) this.variables.set(this.key(name), null);
        return;
      case "assign":
        this.variables.set(this.key(statement.name), this.evaluate(statement.value));
        return;
      case "print":
        this.output.push(this.toStringValue(this.evaluate(statement.value)));
        return;
      case "if":
        this.executeBlock(this.truthy(this.evaluate(statement.condition)) ? statement.thenBranch : statement.elseBranch);
        return;
      case "for": {
        const start = this.toNumber(this.evaluate(statement.start));
        const end = this.toNumber(this.evaluate(statement.end));
        const step = this.toNumber(this.evaluate(statement.step));
        if (step === 0) throw new MacroRuntimeError("For loop Step cannot be zero");
        const continues = (value: number) => step > 0 ? value <= end : value >= end;
        for (let value = start; continues(value); value += step) {
          this.tick();
          this.variables.set(this.key(statement.name), value);
          this.executeBlock(statement.body);
        }
        return;
      }
      case "while":
        while (this.truthy(this.evaluate(statement.condition))) {
          this.tick();
          this.executeBlock(statement.body);
        }
        return;
    }
  }

  private evaluate(expression: Expression): MacroValue {
    switch (expression.kind) {
      case "literal": return expression.value;
      case "variable": {
        const key = this.key(expression.name);
        if (!this.variables.has(key)) throw new MacroRuntimeError(`Variable "${expression.name}" is not declared`);
        return this.variables.get(key) ?? null;
      }
      case "unary": {
        const value = this.evaluate(expression.operand);
        if (expression.operator === "NOT") return !this.truthy(value);
        return expression.operator === "-" ? -this.toNumber(value) : this.toNumber(value);
      }
      case "binary": return this.evaluateBinary(expression.operator, expression.left, expression.right);
      case "call": return this.callBuiltin(expression.name, expression.args.map((arg) => this.evaluate(arg)));
    }
  }

  private evaluateBinary(operator: string, leftExpression: Expression, rightExpression: Expression): MacroValue {
    const left = this.evaluate(leftExpression);
    if (operator === "AND" && !this.truthy(left)) return false;
    if (operator === "OR" && this.truthy(left)) return true;
    const right = this.evaluate(rightExpression);
    switch (operator) {
      case "&": return this.toStringValue(left) + this.toStringValue(right);
      case "+": return typeof left === "string" || typeof right === "string"
        ? this.toStringValue(left) + this.toStringValue(right)
        : this.toNumber(left) + this.toNumber(right);
      case "-": return this.toNumber(left) - this.toNumber(right);
      case "*": return this.toNumber(left) * this.toNumber(right);
      case "/": {
        const divisor = this.toNumber(right);
        if (!divisor) throw new MacroRuntimeError("Division by zero");
        return this.toNumber(left) / divisor;
      }
      case "MOD": {
        const divisor = this.toNumber(right);
        if (!divisor) throw new MacroRuntimeError("Modulo by zero");
        return this.toNumber(left) % divisor;
      }
      case "=": return left === right;
      case "<>": return left !== right;
      case "<": return this.compare(left, right) < 0;
      case ">": return this.compare(left, right) > 0;
      case "<=": return this.compare(left, right) <= 0;
      case ">=": return this.compare(left, right) >= 0;
      case "AND": return this.truthy(left) && this.truthy(right);
      case "OR": return this.truthy(left) || this.truthy(right);
      default: throw new MacroRuntimeError(`Unsupported operator "${operator}"`);
    }
  }

  private callBuiltin(name: string, args: MacroValue[]): MacroValue {
    const normalized = name.toUpperCase();
    const one = () => {
      if (args.length !== 1) throw new MacroRuntimeError(`${name} expects one argument`);
      return args[0];
    };
    switch (normalized) {
      case "ABS": return Math.abs(this.toNumber(one()));
      case "CINT": return Math.round(this.toNumber(one()));
      case "CSTR": return this.toStringValue(one());
      case "INT": return Math.floor(this.toNumber(one()));
      case "LEN": return this.toStringValue(one()).length;
      case "LCASE": return this.toStringValue(one()).toLowerCase();
      case "UCASE": return this.toStringValue(one()).toUpperCase();
      case "ROUND": {
        if (args.length < 1 || args.length > 2) throw new MacroRuntimeError("Round expects one or two arguments");
        const places = args.length === 2 ? this.toNumber(args[1]) : 0;
        const factor = 10 ** places;
        return Math.round(this.toNumber(args[0]) * factor) / factor;
      }
      default: throw new MacroRuntimeError(`Unsupported function "${name}"`);
    }
  }

  private key(name: string): string { return name.toUpperCase(); }
  private truthy(value: MacroValue): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") return value.length > 0;
    return false;
  }
  private toNumber(value: MacroValue): number {
    if (value === null || (typeof value === "string" && value.trim() === "")) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    const converted = Number(value);
    if (!Number.isFinite(converted)) throw new MacroRuntimeError(`Cannot convert "${String(value)}" to a number`);
    return converted;
  }
  private toStringValue(value: MacroValue): string {
    if (value === null) return "";
    if (typeof value === "boolean") return value ? "True" : "False";
    return String(value);
  }
  private compare(left: MacroValue, right: MacroValue): number {
    if (typeof left === "string" && typeof right === "string") return left.localeCompare(right);
    const a = this.toNumber(left);
    const b = this.toNumber(right);
    return a < b ? -1 : a > b ? 1 : 0;
  }
}
