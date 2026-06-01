#!/usr/bin/env node
import { readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "signatures");

const items = readdirSync(dir)
  .filter((name) => name.toLowerCase().endsWith(".png"))
  .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
  .map((name) => ({
    name,
    label: name.replace(/\.png$/i, ""),
  }));

const out = join(dir, "manifest.json");
writeFileSync(out, JSON.stringify(items, null, 2) + "\n");
console.log(`Wrote ${items.length} signatures → ${out}`);
