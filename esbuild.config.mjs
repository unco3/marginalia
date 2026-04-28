import esbuild from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import fs from "fs";
import path from "path";

const PLUGIN_ID = "marginalia";
const VAULT = process.env.OBSIDIAN_VAULT_PATH;
const prod = process.argv[2] === "production";

if (!prod && !VAULT) {
  console.error(
    "[esbuild] OBSIDIAN_VAULT_PATH is not set. Point it at your vault root.",
  );
  console.error("Example: OBSIDIAN_VAULT_PATH=~/Documents/MyVault pnpm dev");
  process.exit(1);
}

const OUTDIR = prod
  ? path.resolve(".")
  : path.join(VAULT, ".obsidian", "plugins", PLUGIN_ID);

if (!prod) {
  fs.mkdirSync(OUTDIR, { recursive: true });
}

const STATIC_FILES = ["manifest.json", "styles.css"];

const copyStaticAssets = {
  name: "copy-static-assets",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      for (const f of STATIC_FILES) {
        if (fs.existsSync(f)) {
          fs.copyFileSync(f, path.join(OUTDIR, f));
        }
      }
      const tag = prod ? "build" : "watch";
      console.log(`[esbuild ${tag}] wrote → ${OUTDIR}`);
    });
  },
};

const ctx = await esbuild.context({
  banner: { js: "/* Marginalia — generated, do not edit */" },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2018",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: path.join(OUTDIR, "main.js"),
  plugins: [copyStaticAssets],
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
  console.log(`[esbuild watch] watching for changes…`);
}
