#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

const PBKDF2_ITERATIONS = 300_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const sigDir = join(root, "signatures");
const outPath = join(root, "signatures.enc.json");

const password = process.argv[2] ?? process.env.SIGNER_PASSWORD;
if (!password) {
  console.error("Usage: node scripts/encrypt-signatures.mjs <password>");
  console.error("   or: SIGNER_PASSWORD=... node scripts/encrypt-signatures.mjs");
  process.exit(1);
}

const subtle = webcrypto.subtle;

async function deriveKey(password, salt) {
  const baseKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const toB64 = (bytes) => Buffer.from(bytes).toString("base64");

const files = readdirSync(sigDir)
  .filter((n) => n.toLowerCase().endsWith(".png"))
  .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

if (files.length === 0) {
  console.error("No PNG files in signatures/.");
  process.exit(1);
}

const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
const key = await deriveKey(password, salt);

const items = [];
for (const name of files) {
  const data = readFileSync(join(sigDir, name));
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: "AES-GCM", iv }, key, data),
  );
  items.push({
    name,
    label: name.replace(/\.png$/i, ""),
    iv: toB64(iv),
    ciphertext: toB64(ciphertext),
  });
  console.log(`encrypted: ${name} (${data.length} → ${ciphertext.length} bytes)`);
}

const bundle = {
  version: 1,
  kdf: "PBKDF2-SHA256",
  iterations: PBKDF2_ITERATIONS,
  cipher: "AES-GCM",
  salt: toB64(salt),
  items,
};

writeFileSync(outPath, JSON.stringify(bundle, null, 2) + "\n");
console.log(`\nWrote ${items.length} encrypted signatures → ${outPath}`);
