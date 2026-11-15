export {};

declare global {
  interface Window {
    nativeBridge?: { open(): void; save(text: string): void };
    documentEditorNative?: {
      receive(payload: { action: string; text?: string; filename?: string; error?: string }): void;
    };
  }
}
