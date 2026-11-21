import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("./", import.meta.url);
await mkdir(new URL("dist/", root), { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("preview.jsx", root))],
  outfile: fileURLToPath(new URL("dist/app.js", root)),
  bundle: true,
  jsx: "automatic",
  format: "iife",
  platform: "browser",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
});
for (const name of ["index.html", "design.css"])
  await copyFile(new URL(name, root), new URL("dist/" + name, root));
await copyFile(
  new URL("../../../desktop/renderer/theme.css", root),
  new URL("dist/base.css", root),
);
await copyFile(
  new URL(
    "../../../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
    root,
  ),
  new URL("dist/geist.woff2", root),
);
console.log(fileURLToPath(new URL("dist/index.html", root)));
