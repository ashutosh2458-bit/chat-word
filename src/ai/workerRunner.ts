/// <reference lib="webworker" />

import pythonSource from "./nlp_worker.py?raw";

type WorkerRequest = {
  id: number;
  text: string;
  task: "summary" | "readability" | "tone" | "hints" | "all";
};

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { type: "status"; status: string };

interface PyodideRuntime {
  globals: { set(name: string, value: unknown): void };
  runPythonAsync(code: string): Promise<unknown>;
}

const worker = self as DedicatedWorkerGlobalScope;
let runtimePromise: Promise<PyodideRuntime> | undefined;

async function getRuntime(): Promise<PyodideRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      worker.postMessage({ type: "status", status: "Loading Pyodide runtime…" });
      const runtimeUrl = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs";
      const imported = await import(/* @vite-ignore */ runtimeUrl) as {
        loadPyodide(options: { indexURL: string }): Promise<PyodideRuntime>;
      };
      const runtime = await imported.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/"
      });
      await runtime.runPythonAsync(pythonSource);
      worker.postMessage({ type: "status", status: "Pyodide ready" });
      return runtime;
    })().catch((error) => {
      runtimePromise = undefined;
      throw error;
    });
  }
  return runtimePromise;
}

worker.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const runtime = await getRuntime();
    runtime.globals.set("editor_input_text", request.text);
    runtime.globals.set("editor_task_name", request.task);
    const result = await runtime.runPythonAsync("analyze_text_json(editor_input_text, editor_task_name)");
    worker.postMessage({
      id: request.id,
      ok: true,
      result: JSON.parse(String(result))
    } satisfies WorkerResponse);
  } catch (error) {
    worker.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    } satisfies WorkerResponse);
  }
});

export {};
