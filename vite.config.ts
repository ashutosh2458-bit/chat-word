import { defineConfig } from "vitest/config";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const userSite = repository.endsWith(".github.io");
const inferredBase =
  process.env.GITHUB_ACTIONS === "true" && repository && !userSite
    ? `/${repository}/`
    : "/";

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? inferredBase,
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  build: { target: "es2022", sourcemap: true },
  worker: { format: "es" }
});
