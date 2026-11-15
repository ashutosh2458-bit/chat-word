export interface EditorSnapshot {
  text: string;
  stats: WasmDocumentStats;
  styles: WasmStyleSpan[];
}

type Listener = (snapshot: EditorSnapshot) => void;

export class EditorStore {
  private readonly engine: WasmDocumentEngine;
  private readonly listeners = new Set<Listener>();

  constructor(module: WasmDocumentCoreModule, initialText = "") {
    this.engine = new module.DocumentEngine(initialText);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): EditorSnapshot {
    const vector = this.engine.getStyleSpans();
    const styles: WasmStyleSpan[] = [];
    try {
      for (let i = 0; i < vector.size(); i += 1) {
        const item = vector.get(i);
        styles.push({
          start: item.start,
          length: item.length,
          style: { ...item.style }
        });
      }
    } finally {
      vector.delete();
    }
    return { text: this.engine.getFullText(), stats: this.engine.getStats(), styles };
  }

  getText(): string {
    return this.engine.getFullText();
  }

  setText(text: string): void {
    const oldChars = Array.from(this.engine.getFullText());
    const newChars = Array.from(text);
    let prefix = 0;
    while (prefix < oldChars.length && prefix < newChars.length && oldChars[prefix] === newChars[prefix]) {
      prefix += 1;
    }
    let suffix = 0;
    while (
      suffix < oldChars.length - prefix &&
      suffix < newChars.length - prefix &&
      oldChars[oldChars.length - 1 - suffix] === newChars[newChars.length - 1 - suffix]
    ) {
      suffix += 1;
    }
    const removed = oldChars.length - prefix - suffix;
    const inserted = newChars.slice(prefix, newChars.length - suffix).join("");
    if (removed || inserted) this.engine.replaceRange(prefix, removed, inserted);
    this.emit();
  }

  insertText(position: number, text: string): void {
    this.engine.insertText(position, text);
    this.emit();
  }

  deleteRange(position: number, length: number): void {
    this.engine.deleteRange(position, length);
    this.emit();
  }

  applyStyle(position: number, length: number, values: Partial<WasmTextStyle>): void {
    this.engine.applyStyle(position, length, {
      bold: values.bold ?? false,
      italic: values.italic ?? false,
      fontFamily: values.fontFamily ?? "",
      color: values.color ?? "",
      alignment: values.alignment ?? ""
    });
    this.emit();
  }

  findRegex(pattern: string, flags = ""): WasmSearchMatch[] {
    const vector = this.engine.findRegex(pattern, flags);
    const result: WasmSearchMatch[] = [];
    try {
      for (let i = 0; i < vector.size(); i += 1) {
        const item = vector.get(i);
        result.push({ start: item.start, length: item.length, value: item.value });
      }
    } finally {
      vector.delete();
    }
    return result;
  }

  replaceRegex(pattern: string, replacement: string, flags = ""): number {
    const count = this.engine.replaceRegex(pattern, replacement, flags);
    if (count > 0) this.emit();
    return count;
  }

  undo(): boolean {
    const changed = this.engine.undo();
    if (changed) this.emit();
    return changed;
  }

  redo(): boolean {
    const changed = this.engine.redo();
    if (changed) this.emit();
    return changed;
  }

  canUndo(): boolean { return this.engine.canUndo(); }
  canRedo(): boolean { return this.engine.canRedo(); }

  dispose(): void {
    this.listeners.clear();
    this.engine.delete();
  }

  private emit(): void {
    const current = this.snapshot();
    for (const listener of this.listeners) listener(current);
  }
}
