/**
 * get_crop_knowledge(crop) — reads ICAR "package of practices" text files
 * for an oilseed crop from data/crop/<Crop>/*.txt. No embeddings: the whole
 * crop file set is returned so the live model can ground its answer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCropAlias } from "../cropAliases.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CROP_DIR = path.join(__dirname, "..", "..", "data", "crop");

let _cache = null;

/** Load and cache all crop folders + their .txt contents. */
function load(dir = CROP_DIR) {
  const cache = { dir, crops: {}, list: [] };
  if (!fs.existsSync(dir)) return cache;
  for (const name of fs.readdirSync(dir).sort()) {
    const folder = path.join(dir, name);
    if (!fs.statSync(folder).isDirectory()) continue;
    const files = [];
    for (const f of fs.readdirSync(folder).sort()) {
      if (!f.toLowerCase().endsWith(".txt")) continue;
      files.push({
        name: f,
        content: fs.readFileSync(path.join(folder, f), "utf8"),
      });
    }
    cache.crops[name] = files;
    if (name !== "General") cache.list.push(name);
  }
  return cache;
}

function cache() {
  if (!_cache) _cache = load();
  return _cache;
}

/** For tests: rebuild cache from a specific dir. */
export function _reload(dir) {
  _cache = load(dir);
  return _cache;
}

/** List available crop names (excludes the General folder). */
export function listCrops() {
  return [...cache().list];
}

/**
 * Eagerly load ALL crop knowledge into memory (called once at startup) and
 * return a manifest as proof of what is resident in memory.
 */
export function preloadAll() {
  const c = cache();
  const crops = c.list.map((name) => {
    const files = c.crops[name] || [];
    return {
      name,
      files: files.length,
      chars: files.reduce((s, f) => s + f.content.length, 0),
    };
  });
  const general = c.crops["General"] || [];
  return {
    count: crops.length,
    totalChars: crops.reduce((s, x) => s + x.chars, 0),
    crops,
    general: {
      files: general.length,
      chars: general.reduce((s, f) => s + f.content.length, 0),
    },
  };
}

/**
 * Resolve a crop name to a canonical folder name using EXACT match first,
 * then the deterministic alias/vernacular dictionary. NO fuzzy guessing —
 * the LLM is responsible for mapping arbitrary misspellings to a real name
 * (the crop mapping is injected into its context); this is the backup.
 * @returns {string|null}
 */
export function resolveCrop(candidate) {
  if (!candidate || typeof candidate !== "string") return null;
  const c = candidate.trim().toLowerCase();
  if (!c) return null;
  for (const n of cache().list) {
    if (n.toLowerCase() === c) return n; // exact canonical
  }
  return resolveCropAlias(candidate, cache().list); // deterministic alias map
}

/**
 * @param {string} crop
 * @returns {{ok:boolean, crop?:string, files?:{name:string,content:string}[], general?:object, error?:string, available?:string[]}}
 */
export function getCropKnowledge(crop) {
  const c = cache();
  const resolved = resolveCrop(crop);
  if (!resolved) {
    return { ok: false, error: `Could not match crop "${crop}"`, available: [...c.list] };
  }
  const result = { ok: true, crop: resolved, files: c.crops[resolved] || [] };
  if (c.crops["General"] && c.crops["General"].length) {
    result.general = { files: c.crops["General"] };
  }
  return result;
}
