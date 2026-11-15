export type EditorCommand = "bold" | "italic" | "undo" | "redo";
type Handler = (selectionStart: number, selectionLength: number) => void;

export class CommandRegistry {
  private readonly handlers = new Map<EditorCommand, Handler>();

  register(command: EditorCommand, handler: Handler): void {
    this.handlers.set(command, handler);
  }

  execute(command: EditorCommand, start = 0, length = 0): boolean {
    const handler = this.handlers.get(command);
    if (!handler) return false;
    handler(start, length);
    return true;
  }

  has(command: EditorCommand): boolean {
    return this.handlers.has(command);
  }
}
