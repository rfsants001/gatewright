import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("./", import.meta.url);
const output = new URL("../dist/desktop/", root);
await mkdir(new URL("renderer/", output), { recursive: true });

await Promise.all([
  ...["main.mjs", "preload.cjs", "renderer/index.html", "renderer/theme.css"].map((file) =>
    copyFile(new URL(file, root), new URL(file, output))),
  copyFile(new URL("../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2", root), new URL("renderer/geist.woff2", output)),
  copyFile(new URL("../node_modules/@fontsource-variable/geist/LICENSE", root), new URL("renderer/geist-LICENSE", output)),
  copyFile(new URL("../node_modules/lucide-react/LICENSE", root), new URL("renderer/lucide-LICENSE", output)),
  build({
    entryPoints: [fileURLToPath(new URL("renderer/app.jsx", root))],
    outfile: fileURLToPath(new URL("renderer/app.js", output)),
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
  }),
]);
