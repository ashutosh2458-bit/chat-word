# Document Editor App

A cross-platform editor starter using a C++20 piece-table engine compiled to WebAssembly, a TypeScript/Vite interface, a constrained VBA-style macro interpreter, a Pyodide NLP worker, and an Objective-C macOS wrapper.

## Requirements

- Node.js 20/22 and npm
- CMake 3.20+ and Emscripten SDK (`emcmake`, `emcc`) for WebAssembly
- C++20 compiler for native tests
- macOS 12+ and Xcode Command Line Tools for the native wrapper

## Start

```bash
npm install
npm run wasm:build
npm run dev
```

The WASM build creates `public/wasm/document_core.js` and `public/wasm/document_core.wasm`. These are generated outputs and are not committed. Run `npm run typecheck`, `npm test`, and `npm run test:cpp` for checks. Run `npm run build` for the production site.

## C++ engine API

Embind exports `DocumentEngine` methods: `insertText`, `deleteRange`, `replaceRange`, `applyStyle`, `getTextRange`, `getFullText`, `getStyleSpans`, `findRegex`, `replaceRegex`, `undo`, `redo`, `canUndo`, `canRedo`, `length`, and `getStats`. Public positions and lengths use Unicode code-point offsets. The TypeScript UI converts DOM UTF-16 offsets to code points. Regex syntax follows C++ `std::regex` ECMAScript grammar and operates on UTF-8 bytes; Unicode-aware character classes and grapheme-cluster indexing are not implemented. Returned positions are converted to Unicode code-point offsets.

The piece table keeps an immutable original buffer and append-only add buffer. Undo/redo snapshots piece metadata and style spans, truncating the redo branch when a new edit follows undo. History is capped at 300 snapshots.

## VBA-style macro subset

This is not Microsoft VBA and does not load arbitrary VBA projects. The safe subset supports `Dim`, scalar assignment, `If/Then/Else/End If`, `For/To/Step/Next`, `While/Wend`, `Print`, `Debug.Print`, arithmetic, comparisons, `And`, `Or`, `Not`, concatenation (`&`), and built-ins `Abs`, `CInt`, `CStr`, `Int`, `Len`, `LCase`, `UCase`, and `Round`. It has no filesystem, process, network, COM, shell, reflection, or arbitrary JavaScript access. Execution is bounded by a step budget.

## NLP worker

The AI panel lazily loads Pyodide from its public CDN on first use, so first-run analysis needs an internet connection. To run offline, self-host the Pyodide distribution and update `src/ai/workerRunner.ts`. The Python analysis itself uses only the standard library and does not call external services. Its summaries and writing signals are heuristic aids.

## macOS wrapper

After `npm run build`, run `make macos` on macOS, then `open build/DocumentEditor.app`. The wrapper uses `WKWebView` and native open/save panels for UTF-8 plain text only. It does not parse DOCX, RTF, or PDF. Change the sample bundle identifier in `native/macos/Info.plist`, then configure signing, sandbox entitlements, hardened runtime, and notarization before distribution.

## GitHub Pages

`.github/workflows/deploy.yml` builds WASM and deploys `dist/`. `vite.config.ts` derives the project-site base path from `GITHUB_REPOSITORY`; set `VITE_BASE_PATH=/` for a custom domain if needed. The workflow uses `npm install` (not `npm ci`) because this source archive omits a lockfile. For reproducible releases, generate and commit `package-lock.json`, then switch CI to `npm ci`.

## Scope and limitations

The editor stores documents in memory. There is no cloud sync, autosave, DOCX/RTF/PDF import/export, collaboration backend, or persistent document database. Styling is represented as engine spans. The macro language is intentionally limited. The macOS wrapper source is included, but app signing and distribution remain publisher-specific.


## Recreate the source archive

The included `build_repo.py` script is self-contained. Run it with Python 3 from the directory where you want the output; it recreates `document-editor-app/` and `document-editor-app.zip`. It uses only Python's standard library.
