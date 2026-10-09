import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (["next/cache", "next/navigation", "next/server"].includes(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

    const base = resolve(sourceRoot, specifier.slice(2));
    const candidate = [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts"), resolve(base, "index.tsx")]
      .find((path) => existsSync(path));

    if (!candidate) return nextResolve(specifier, context);
    return { shortCircuit: true, url: pathToFileURL(candidate).href };
  },
});
