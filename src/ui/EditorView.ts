import { CommandRegistry, EditorCommand } from "../core/CommandRegistry";
import { EditorStore, EditorSnapshot } from "../core/EditorStore";
import { VbaInterpreter } from "../vba/interpreter";

interface EditorViewOptions {
  store: EditorStore;
  commands: CommandRegistry;
  onSummarize: (text: string) => Promise<unknown>;
  onAIStatus: (listener: (status: string) => void) => void;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character] ?? character);
}

function codePointOffset(text: string, utf16: number): number {
  return Array.from(text.slice(0, utf16)).length;
}

function utf16Offset(text: string, codePoints: number): number {
  return Array.from(text).slice(0, codePoints).join("").length;
}

export class EditorView {
  private readonly store: EditorStore;
  private readonly commands: CommandRegistry;
  private readonly editor: HTMLDivElement;
  private readonly macroInput: HTMLTextAreaElement;
  private readonly macroOutput: HTMLPreElement;
  private readonly aiOutput: HTMLPreElement;
  private currentSnapshot?: EditorSnapshot;
  private applyingInput = false;
  private readonly unsubscribe: () => void;

  constructor(root: HTMLElement, options: EditorViewOptions) {
    this.store = options.store;
    this.commands = options.commands;

    root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div><p class="eyebrow">C++20 · WebAssembly · TypeScript</p><h1>Document Editor</h1></div>
          <div class="native-actions">
            <button class="button secondary" id="native-open" type="button">Open file</button>
            <button class="button secondary" id="native-save" type="button">Save file</button>
          </div>
        </header>
        <section class="toolbar" aria-label="Editor tools">
          <button class="button" data-command="bold" type="button"><strong>B</strong> Bold</button>
          <button class="button" data-command="italic" type="button"><em>I</em> Italic</button>
          <span class="toolbar-divider"></span>
          <button class="button secondary" data-command="undo" type="button">Undo</button>
          <button class="button secondary" data-command="redo" type="button">Redo</button>
          <span class="toolbar-divider"></span>
          <input id="search-pattern" aria-label="Regular expression" placeholder="Regex pattern" />
          <input id="replace-value" aria-label="Replacement text" placeholder="Replace with" />
          <button class="button secondary" id="search-button" type="button">Find</button>
          <button class="button secondary" id="replace-button" type="button">Replace all</button>
        </section>
        <main class="workspace">
          <section class="editor-panel">
            <div class="panel-heading">
              <div><h2>Document</h2><p>Text is held in the in-memory WebAssembly document engine.</p></div>
              <span class="engine-tag">WASM CORE</span>
            </div>
            <div id="editor" class="editor" contenteditable="true" role="textbox"
              aria-label="Document text" aria-multiline="true" spellcheck="true"></div>
            <div class="statusbar"><span id="status" role="status" aria-live="polite">Ready</span><span id="stats"></span></div>
          </section>
          <aside class="side-panel">
            <section class="tool-card">
              <div class="panel-heading"><div><h2>AI writing helper</h2><p>Optional text analysis through Pyodide.</p></div></div>
              <button class="button primary" id="summarize-button" type="button">Summarize document</button>
              <pre id="ai-output" class="output" aria-live="polite">Analysis has not run yet.</pre>
            </section>
            <section class="tool-card">
              <div class="panel-heading"><div><h2>VBA-style macros</h2><p>Restricted interpreter with an execution limit.</p></div></div>
              <textarea id="macro-input" class="macro-input" spellcheck="false" aria-label="Macro source"></textarea>
              <button class="button primary" id="run-macro" type="button">Run macro</button>
              <pre id="macro-output" class="output" aria-live="polite">Macro output appears here.</pre>
            </section>
          </aside>
        </main>
        <footer class="footer-note">
          Browser mode edits plain text. Native open/save is available in the macOS wrapper.
          DOCX, RTF, and PDF import/export are not included.
        </footer>
      </div>
    `;

    this.editor = root.querySelector<HTMLDivElement>("#editor")!;
    this.macroInput = root.querySelector<HTMLTextAreaElement>("#macro-input")!;
    this.macroOutput = root.querySelector<HTMLPreElement>("#macro-output")!;
    this.aiOutput = root.querySelector<HTMLPreElement>("#ai-output")!;

    this.macroInput.value = `Sub Main()
  Dim greeting As String
  greeting = "Hello from the macro interpreter"
  Debug.Print greeting
End Sub`;

    root.querySelectorAll<HTMLButtonElement>("[data-command]").forEach((button) => {
      button.addEventListener("click", () => {
        const command = button.dataset.command as EditorCommand;
        const selection = this.getSelectionOffsets();
        this.commands.execute(command, selection.start, selection.length);
        this.renderDocument(selection.start, selection.length);
      });
    });

    this.editor.addEventListener("input", () => {
      const selection = this.getSelectionOffsets();
      const text = this.editor.innerText.replace(/\r\n/g, "\n");
      this.applyingInput = true;
      this.store.setText(text);
      this.applyingInput = false;
      this.renderDocument(selection.start, selection.length);
    });

    root.querySelector<HTMLButtonElement>("#native-open")!.addEventListener("click", () => {
      if (window.nativeBridge) window.nativeBridge.open();
      else this.setStatus("Native open is available in the macOS app wrapper.");
    });
    root.querySelector<HTMLButtonElement>("#native-save")!.addEventListener("click", () => {
      if (window.nativeBridge) window.nativeBridge.save(this.store.getText());
      else this.setStatus("Native save is available in the macOS app wrapper.");
    });

    root.querySelector<HTMLButtonElement>("#search-button")!.addEventListener("click", () => {
      const pattern = root.querySelector<HTMLInputElement>("#search-pattern")!.value;
      const matches = this.store.findRegex(pattern);
      this.setStatus(`${matches.length} regex match(es) found.`);
      if (matches[0]) this.restoreSelection(matches[0].start, matches[0].length);
    });

    root.querySelector<HTMLButtonElement>("#replace-button")!.addEventListener("click", () => {
      const pattern = root.querySelector<HTMLInputElement>("#search-pattern")!.value;
      const replacement = root.querySelector<HTMLInputElement>("#replace-value")!.value;
      const count = this.store.replaceRegex(pattern, replacement);
      this.setStatus(`${count} replacement(s) made.`);
      this.renderDocument();
    });

    root.querySelector<HTMLButtonElement>("#run-macro")!.addEventListener("click", () => {
      try {
        const result = new VbaInterpreter().run(this.macroInput.value);
        this.macroOutput.textContent = result.output.join("\n") || "(No output)";
        this.setStatus(`Macro completed in ${result.steps} steps.`);
      } catch (error) {
        this.macroOutput.textContent = error instanceof Error ? error.message : String(error);
        this.setStatus("Macro did not complete.");
      }
    });

    root.querySelector<HTMLButtonElement>("#summarize-button")!.addEventListener("click", async () => {
      this.aiOutput.textContent = "Preparing Pyodide…";
      try {
        const result = await options.onSummarize(this.store.getText());
        this.aiOutput.textContent = JSON.stringify(result, null, 2);
      } catch (error) {
        this.aiOutput.textContent = error instanceof Error ? error.message : String(error);
      }
    });

    options.onAIStatus((message) => this.setStatus(message));

    this.unsubscribe = this.store.subscribe((snapshot) => {
      this.currentSnapshot = snapshot;
      this.updateStats(snapshot);
      if (!this.applyingInput && this.editor.textContent !== snapshot.text) this.renderDocument();
    });
    this.renderDocument();
  }

  dispose(): void {
    this.unsubscribe();
  }

  private setStatus(message: string): void {
    const element = document.querySelector<HTMLSpanElement>("#status");
    if (element) element.textContent = message;
  }

  private updateStats(snapshot: EditorSnapshot): void {
    const element = document.querySelector<HTMLSpanElement>("#stats");
    if (element) {
      const stats = snapshot.stats;
      element.textContent = `${stats.charCount} chars · ${stats.wordCount} words · ${stats.lineCount} lines`;
    }
  }

  private renderDocument(selectionStart?: number, selectionLength = 0): void {
    const snapshot = this.currentSnapshot ?? this.store.snapshot();
    const characters = Array.from(snapshot.text);
    const parts: string[] = [];
    let cursor = 0;

    while (cursor < characters.length) {
      const active = snapshot.styles.filter((span) => cursor >= span.start && cursor < span.start + span.length);
      const mergeStyle = (spans: WasmStyleSpan[]): WasmTextStyle | undefined => {
        if (!spans.length) return undefined;
        return spans.reduce<WasmTextStyle>((merged, span) => ({
          bold: merged.bold || span.style.bold,
          italic: merged.italic || span.style.italic,
          fontFamily: span.style.fontFamily || merged.fontFamily,
          color: span.style.color || merged.color,
          alignment: span.style.alignment || merged.alignment
        }), { bold: false, italic: false, fontFamily: "", color: "", alignment: "" });
      };
      const style = mergeStyle(active);
      let end = cursor + 1;
      while (end < characters.length) {
        const nextActive = snapshot.styles.filter((span) => end >= span.start && end < span.start + span.length);
        const nextStyle = mergeStyle(nextActive);
        if (JSON.stringify(nextStyle ?? null) !== JSON.stringify(style ?? null)) break;
        end += 1;
      }
      const content = escapeHtml(characters.slice(cursor, end).join(""));
      if (style && (style.bold || style.italic || style.color || style.fontFamily || style.alignment)) {
        const css = [
          style.bold ? "font-weight:700" : "",
          style.italic ? "font-style:italic" : "",
          style.color ? `color:${escapeHtml(style.color)}` : "",
          style.fontFamily ? `font-family:${escapeHtml(style.fontFamily)}` : "",
          style.alignment ? `text-align:${escapeHtml(style.alignment)}` : ""
        ].filter(Boolean).join(";");
        parts.push(`<span style="${css}">${content}</span>`);
      } else {
        parts.push(content);
      }
      cursor = end;
    }

    this.editor.innerHTML = parts.join("");
    if (selectionStart !== undefined) this.restoreSelection(selectionStart, selectionLength);
  }

  private getSelectionOffsets(): { start: number; length: number } {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return { start: 0, length: 0 };
    const range = selection.getRangeAt(0);
    if (!this.editor.contains(range.startContainer) || !this.editor.contains(range.endContainer)) {
      return { start: 0, length: 0 };
    }
    const beforeStart = document.createRange();
    beforeStart.selectNodeContents(this.editor);
    beforeStart.setEnd(range.startContainer, range.startOffset);
    const beforeEnd = document.createRange();
    beforeEnd.selectNodeContents(this.editor);
    beforeEnd.setEnd(range.endContainer, range.endOffset);
    const text = this.editor.innerText.replace(/\r\n/g, "\n");
    const startUtf16 = Math.min(beforeStart.toString().length, beforeEnd.toString().length);
    const endUtf16 = Math.max(beforeStart.toString().length, beforeEnd.toString().length);
    return {
      start: codePointOffset(text, startUtf16),
      length: codePointOffset(text, endUtf16) - codePointOffset(text, startUtf16)
    };
  }

  private restoreSelection(startCodePoints: number, lengthCodePoints: number): void {
    const text = this.editor.textContent ?? "";
    const start = utf16Offset(text, startCodePoints);
    const end = utf16Offset(text, startCodePoints + lengthCodePoints);
    const walker = document.createTreeWalker(this.editor, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let current: Node | null;
    while ((current = walker.nextNode())) nodes.push(current as Text);

    const locate = (target: number): { node: Text; offset: number } | undefined => {
      let remaining = target;
      for (const node of nodes) {
        if (remaining <= node.data.length) return { node, offset: remaining };
        remaining -= node.data.length;
      }
      const last = nodes[nodes.length - 1];
      return last ? { node: last, offset: last.data.length } : undefined;
    };

    const startPoint = locate(start);
    const endPoint = locate(end);
    if (!startPoint || !endPoint) return;
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    this.editor.focus();
  }
}
