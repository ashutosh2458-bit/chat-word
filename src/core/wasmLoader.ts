let modulePromise: Promise<WasmDocumentCoreModule> | undefined;

export function loadDocumentCore(): Promise<WasmDocumentCoreModule> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const scriptUrl = new URL(`${import.meta.env.BASE_URL}wasm/document_core.js`, window.location.origin);
      const imported = await import(/* @vite-ignore */ scriptUrl.href) as {
        default: (options: { locateFile: (path: string) => string }) => Promise<WasmDocumentCoreModule>;
      };
      return imported.default({ locateFile: (path) => new URL(path, scriptUrl).href });
    })().catch((error) => {
      modulePromise = undefined;
      throw new Error(`Unable to load the WebAssembly core. Run "npm run wasm:build" first. ${String(error)}`);
    });
  }
  return modulePromise;
}
