export type TokenType = "number" | "string" | "identifier" | "operator" | "punctuation" | "newline" | "eof";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

export class VbaSyntaxError extends Error {
  constructor(message: string, public readonly line: number, public readonly column: number) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "VbaSyntaxError";
  }
}

export class Lexer {
  private index = 0;
  private line = 1;
  private column = 1;
  private readonly tokens: Token[] = [];

  constructor(private readonly source: string) {}

  tokenize(): Token[] {
    while (!this.isAtEnd()) {
      const character = this.peek();
      if (character === " " || character === "\t" || character === "\r") {
        this.advance();
      } else if (character === "\n") {
        this.add("newline", "\n");
        this.advance();
        this.line += 1;
        this.column = 1;
      } else if (character === "'") {
        while (!this.isAtEnd() && this.peek() !== "\n") this.advance();
      } else if (this.isDigit(character)) {
        this.readNumber();
      } else if (character === '"') {
        this.readString();
      } else if (this.isIdentifierStart(character)) {
        this.readIdentifier();
      } else {
        const pair = character + this.peekNext();
        if (["<=", ">=", "<>"].includes(pair)) {
          this.add("operator", pair);
          this.advance();
          this.advance();
        } else if ("+-*/=&<>".includes(character)) {
          this.add("operator", character);
          this.advance();
        } else if ("(),.:".includes(character)) {
          this.add("punctuation", character);
          this.advance();
        } else {
          throw new VbaSyntaxError(`Unexpected character "${character}"`, this.line, this.column);
        }
      }
    }
    this.tokens.push({ type: "eof", value: "", line: this.line, column: this.column });
    return this.tokens;
  }

  private readNumber(): void {
    const start = this.index;
    const column = this.column;
    while (this.isDigit(this.peek())) this.advance();
    if (this.peek() === "." && this.isDigit(this.peekNext())) {
      this.advance();
      while (this.isDigit(this.peek())) this.advance();
    }
    this.tokens.push({ type: "number", value: this.source.slice(start, this.index), line: this.line, column });
  }

  private readString(): void {
    const column = this.column;
    this.advance();
    let value = "";
    while (!this.isAtEnd()) {
      const character = this.peek();
      if (character === "\n") throw new VbaSyntaxError("Unterminated string literal", this.line, column);
      if (character === '"') {
        this.advance();
        if (this.peek() === '"') {
          value += '"';
          this.advance();
          continue;
        }
        this.tokens.push({ type: "string", value, line: this.line, column });
        return;
      }
      value += character;
      this.advance();
    }
    throw new VbaSyntaxError("Unterminated string literal", this.line, column);
  }

  private readIdentifier(): void {
    const start = this.index;
    const column = this.column;
    while (this.isIdentifierPart(this.peek())) this.advance();
    this.tokens.push({ type: "identifier", value: this.source.slice(start, this.index), line: this.line, column });
  }

  private add(type: TokenType, value: string): void {
    this.tokens.push({ type, value, line: this.line, column: this.column });
  }

  private peek(): string { return this.source[this.index] ?? ""; }
  private peekNext(): string { return this.source[this.index + 1] ?? ""; }
  private advance(): string {
    const value = this.source[this.index] ?? "";
    this.index += 1;
    this.column += 1;
    return value;
  }
  private isAtEnd(): boolean { return this.index >= this.source.length; }
  private isDigit(value: string): boolean { return value >= "0" && value <= "9"; }
  private isIdentifierStart(value: string): boolean { return /[A-Za-z_]/.test(value); }
  private isIdentifierPart(value: string): boolean { return /[A-Za-z0-9_]/.test(value); }
}
