import { Lexer, Token, VbaSyntaxError } from "./lexer";

export type Expression =
  | { kind: "literal"; value: number | string | boolean | null }
  | { kind: "variable"; name: string }
  | { kind: "unary"; operator: string; operand: Expression }
  | { kind: "binary"; operator: string; left: Expression; right: Expression }
  | { kind: "call"; name: string; args: Expression[] };

export type Statement =
  | { kind: "dim"; names: string[] }
  | { kind: "assign"; name: string; value: Expression }
  | { kind: "print"; value: Expression }
  | { kind: "if"; condition: Expression; thenBranch: Statement[]; elseBranch: Statement[] }
  | { kind: "for"; name: string; start: Expression; end: Expression; step: Expression; body: Statement[] }
  | { kind: "while"; condition: Expression; body: Statement[] };

export class Parser {
  private current = 0;
  private readonly tokens: Token[];

  constructor(source: string) {
    this.tokens = new Lexer(source).tokenize();
  }

  parse(): Statement[] {
    this.skipSeparators();
    let procedure = false;
    if (this.matchKeyword("SUB")) {
      procedure = true;
      this.consumeIdentifier("Expected procedure name");
      if (this.matchValue("(")) {
        while (!this.checkValue(")") && !this.isAtEnd()) this.advance();
        this.consumeValue(")", "Expected ')' after procedure name");
      }
      this.consumeLineEnd();
    }
    const statements = this.parseBlock(procedure ? ["END SUB"] : []);
    if (procedure) {
      this.consumeKeyword("END", "Expected End Sub");
      this.consumeKeyword("SUB", "Expected End Sub");
    }
    this.skipSeparators();
    if (!this.isAtEnd()) this.fail("Unexpected trailing tokens");
    return statements;
  }

  private parseBlock(stops: string[]): Statement[] {
    const statements: Statement[] = [];
    this.skipSeparators();
    while (!this.isAtEnd() && !this.atStop(stops)) {
      statements.push(this.parseStatement());
      this.skipSeparators();
    }
    return statements;
  }

  private parseStatement(): Statement {
    if (this.matchKeyword("DIM")) return this.parseDim();
    if (this.matchKeyword("LET")) return this.parseAssignment();
    if (this.matchKeyword("IF")) return this.parseIf();
    if (this.matchKeyword("FOR")) return this.parseFor();
    if (this.matchKeyword("WHILE")) return this.parseWhile();
    if (this.matchKeyword("DEBUG")) {
      this.consumeValue(".", "Expected '.' after Debug");
      this.consumeKeyword("PRINT", "Expected Debug.Print");
      return { kind: "print", value: this.parseExpression() };
    }
    if (this.matchKeyword("PRINT")) return { kind: "print", value: this.parseExpression() };
    if (this.checkType("identifier") && this.checkNextValue("=")) return this.parseAssignment();
    this.fail(`Unsupported statement starting with "${this.peek().value}"`);
  }

  private parseDim(): Statement {
    const names: string[] = [];
    do {
      names.push(this.consumeIdentifier("Expected variable name").value);
      if (this.matchKeyword("AS")) this.consumeIdentifier("Expected type name after As");
    } while (this.matchValue(","));
    return { kind: "dim", names };
  }

  private parseAssignment(): Statement {
    const name = this.consumeIdentifier("Expected variable name").value;
    this.consumeValue("=", "Expected '=' in assignment");
    return { kind: "assign", name, value: this.parseExpression() };
  }

  private parseIf(): Statement {
    const condition = this.parseExpression();
    this.consumeKeyword("THEN", "Expected Then after If condition");
    if (!this.checkType("newline") && !this.checkType("eof")) {
      const thenStatement = this.parseStatement();
      const elseBranch = this.matchKeyword("ELSE") ? [this.parseStatement()] : [];
      return { kind: "if", condition, thenBranch: [thenStatement], elseBranch };
    }
    this.consumeLineEnd();
    const thenBranch = this.parseBlock(["ELSE", "END IF"]);
    let elseBranch: Statement[] = [];
    if (this.matchKeyword("ELSE")) {
      this.consumeLineEnd();
      elseBranch = this.parseBlock(["END IF"]);
    }
    this.consumeKeyword("END", "Expected End If");
    this.consumeKeyword("IF", "Expected End If");
    return { kind: "if", condition, thenBranch, elseBranch };
  }

  private parseFor(): Statement {
    const name = this.consumeIdentifier("Expected loop variable").value;
    this.consumeValue("=", "Expected '=' in For statement");
    const start = this.parseExpression();
    this.consumeKeyword("TO", "Expected To in For statement");
    const end = this.parseExpression();
    const step: Expression = this.matchKeyword("STEP")
      ? this.parseExpression()
      : { kind: "literal", value: 1 };
    this.consumeLineEnd();
    const body = this.parseBlock(["NEXT"]);
    this.consumeKeyword("NEXT", "Expected Next");
    if (this.checkType("identifier")) this.advance();
    return { kind: "for", name, start, end, step, body };
  }

  private parseWhile(): Statement {
    const condition = this.parseExpression();
    this.consumeLineEnd();
    const body = this.parseBlock(["WEND"]);
    this.consumeKeyword("WEND", "Expected Wend");
    return { kind: "while", condition, body };
  }

  private parseExpression(minPrecedence = 0): Expression {
    let left = this.parseUnary();
    while (true) {
      const operator = this.peekOperator();
      const precedence = this.precedence(operator);
      if (precedence < minPrecedence) break;
      this.advance();
      const right = this.parseExpression(precedence + 1);
      left = { kind: "binary", operator: operator.toUpperCase(), left, right };
    }
    return left;
  }

  private parseUnary(): Expression {
    if (this.matchKeyword("NOT")) return { kind: "unary", operator: "NOT", operand: this.parseUnary() };
    if (this.matchValue("-")) return { kind: "unary", operator: "-", operand: this.parseUnary() };
    if (this.matchValue("+")) return { kind: "unary", operator: "+", operand: this.parseUnary() };
    return this.parsePrimary();
  }

  private parsePrimary(): Expression {
    if (this.matchValue("(")) {
      const expression = this.parseExpression();
      this.consumeValue(")", "Expected ')' after expression");
      return expression;
    }
    if (this.checkType("number")) return { kind: "literal", value: Number(this.advance().value) };
    if (this.checkType("string")) return { kind: "literal", value: this.advance().value };
    if (this.matchKeyword("TRUE")) return { kind: "literal", value: true };
    if (this.matchKeyword("FALSE")) return { kind: "literal", value: false };
    if (this.matchKeyword("NOTHING") || this.matchKeyword("NULL")) return { kind: "literal", value: null };

    if (this.checkType("identifier")) {
      const name = this.advance().value;
      if (this.matchValue("(")) {
        const args: Expression[] = [];
        if (!this.checkValue(")")) {
          do { args.push(this.parseExpression()); } while (this.matchValue(","));
        }
        this.consumeValue(")", "Expected ')' after function arguments");
        return { kind: "call", name, args };
      }
      return { kind: "variable", name };
    }
    this.fail(`Expected expression, found "${this.peek().value}"`);
  }

  private peekOperator(): string {
    const token = this.peek();
    if (token.type === "operator") return token.value;
    if (token.type === "identifier" && ["AND", "OR", "MOD"].includes(token.value.toUpperCase())) return token.value;
    return "";
  }

  private precedence(operator: string): number {
    switch (operator.toUpperCase()) {
      case "OR": return 1;
      case "AND": return 2;
      case "=": case "<>": case "<": case ">": case "<=": case ">=": return 3;
      case "&": case "+": case "-": return 4;
      case "*": case "/": case "MOD": return 5;
      default: return -1;
    }
  }

  private atStop(stops: string[]): boolean {
    return stops.some((stop) => stop.split(" ").every((part, index) =>
      this.peek(index).value.toUpperCase() === part));
  }

  private consumeLineEnd(): void {
    if (this.matchType("newline")) this.skipSeparators();
    else if (!this.checkType("eof")) this.fail("Expected end of line");
  }

  private skipSeparators(): void {
    while (this.matchType("newline") || this.matchValue(":")) { /* statement separator */ }
  }

  private consumeIdentifier(message: string): Token {
    if (!this.checkType("identifier")) this.fail(message);
    return this.advance();
  }
  private consumeKeyword(value: string, message: string): Token {
    if (!this.matchKeyword(value)) this.fail(message);
    return this.previous();
  }
  private consumeValue(value: string, message: string): Token {
    if (!this.matchValue(value)) this.fail(message);
    return this.previous();
  }
  private matchKeyword(value: string): boolean {
    if (!this.checkKeyword(value)) return false;
    this.advance();
    return true;
  }
  private matchValue(value: string): boolean {
    if (!this.checkValue(value)) return false;
    this.advance();
    return true;
  }
  private matchType(type: Token["type"]): boolean {
    if (!this.checkType(type)) return false;
    this.advance();
    return true;
  }
  private checkKeyword(value: string): boolean {
    return this.peek().type === "identifier" && this.peek().value.toUpperCase() === value;
  }
  private checkValue(value: string): boolean { return this.peek().value === value; }
  private checkNextValue(value: string): boolean { return this.peek(1).value === value; }
  private checkType(type: Token["type"]): boolean { return this.peek().type === type; }
  private advance(): Token {
    if (!this.isAtEnd()) this.current += 1;
    return this.previous();
  }
  private isAtEnd(): boolean { return this.peek().type === "eof"; }
  private peek(offset = 0): Token { return this.tokens[Math.min(this.current + offset, this.tokens.length - 1)]; }
  private previous(): Token { return this.tokens[Math.max(0, this.current - 1)]; }
  private fail(message: string): never {
    const token = this.peek();
    throw new VbaSyntaxError(message, token.line, token.column);
  }
}
