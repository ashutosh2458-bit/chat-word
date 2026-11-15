import "./style.css";
import { loadDocumentCore } from "./core/wasmLoader";
import { EditorStore } from "./core/EditorStore";
import { CommandRegistry } from "./core/CommandRegistry";
import { EditorView } from "./ui/EditorView";
import { AIManager } from "./ai/AIManager";

async function start(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("App root element was not found.");

  try {
    const wasm = await loadDocumentCore();
    const store = new EditorStore(
      wasm,
      "Welcome to Document Editor.\n\nThis document is powered by a C++20 piece table compiled to WebAssembly."
    );
    const commands = new CommandRegistry();
    commands.register("bold", (start, length) => store.applyStyle(start, length, { bold: true }));
    commands.register("italic", (start, length) => store.applyStyle(start, length, { italic: true }));
    commands.register("undo", () => store.undo());
    commands.register("redo", () => store.redo());

    const ai = new AIManager();
    const view = new EditorView(root, {
      store,
      commands,
      onSummarize: (text) => ai.analyze(text, "summary"),
      onAIStatus: (listener) => ai.onStatus(listener)
    });

    window.documentEditorNative = {
      receive(payload) {
        if (payload.error) {
          const status = document.querySelector("#status");
          if (status) status.textContent = payload.error;
          return;
        }
        if (payload.action === "open" && typeof payload.text === "string") {
          store.setText(payload.text);
          const status = document.querySelector("#status");
          if (status) status.textContent = `Opened ${payload.filename ?? "document"}`;
        } else if (payload.action === "save") {
          const status = document.querySelector("#status");
          if (status) status.textContent = `Saved ${payload.filename ?? "document"}`;
        }
      }
    };

    window.addEventListener("beforeunload", () => {
      view.dispose();
      store.dispose();
      ai.dispose();
    });
  } catch (error) {
    const message = String(error).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character] ?? character);
    root.innerHTML = `<main class="fatal"><h1>Document Editor could not start</h1>
      <p>${message}</p><p>Build the WebAssembly core with <code>npm run wasm:build</code>.</p></main>`;
  }
}

void start();
