export {};

declare global {
  interface ImportMetaEnv { readonly BASE_URL: string; }
  interface ImportMeta { readonly env: ImportMetaEnv; }

  interface EmbindVector<T> {
    size(): number;
    get(index: number): T;
    delete(): void;
  }

  interface WasmTextStyle {
    bold: boolean;
    italic: boolean;
    fontFamily: string;
    color: string;
    alignment: string;
  }

  interface WasmStyleSpan {
    start: number;
    length: number;
    style: WasmTextStyle;
  }

  interface WasmSearchMatch {
    start: number;
    length: number;
    value: string;
  }

  interface WasmDocumentStats {
    charCount: number;
    wordCount: number;
    lineCount: number;
  }

  interface WasmDocumentEngine {
    insertText(position: number, text: string): void;
    deleteRange(position: number, length: number): void;
    replaceRange(position: number, length: number, text: string): void;
    applyStyle(position: number, length: number, style: WasmTextStyle): void;
    getTextRange(position: number, length: number): string;
    getFullText(): string;
    getStyleSpans(): EmbindVector<WasmStyleSpan>;
    findRegex(pattern: string, flags: string): EmbindVector<WasmSearchMatch>;
    replaceRegex(pattern: string, replacement: string, flags: string): number;
    undo(): boolean;
    redo(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;
    length(): number;
    getStats(): WasmDocumentStats;
    delete(): void;
  }

  interface WasmDocumentCoreModule {
    DocumentEngine: new (initialText: string) => WasmDocumentEngine;
  }
}
