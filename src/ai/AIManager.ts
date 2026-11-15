type AnalysisTask = "summary" | "readability" | "tone" | "hints" | "all";

type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { type: "status"; status: string };

export class AIManager {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
  }>();
  private statusListener?: (status: string) => void;

  constructor() {
    this.worker = new Worker(new URL("./workerRunner.ts", import.meta.url), { type: "module" });
    this.worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (!("id" in message)) {
        this.statusListener?.(message.status);
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error));
    });
    this.worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "AI worker failed");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  onStatus(listener: (status: string) => void): void {
    this.statusListener = listener;
  }

  analyze(text: string, task: AnalysisTask = "summary"): Promise<unknown> {
    if (!text.trim()) return Promise.reject(new Error("Enter some text before running analysis."));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, text, task });
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const pending of this.pending.values()) pending.reject(new Error("AI worker was closed"));
    this.pending.clear();
  }
}
