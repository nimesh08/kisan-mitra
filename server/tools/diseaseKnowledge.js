/**
 * get_disease_knowledge(crop) — reads structured disease tables (symptoms,
 * control measures, chemical dose) from data/diseases/<Crop>/*.txt plus any
 * reference images. Only Sunflower is populated today; other crops fall back
 * to their crop-knowledge pest/disease sections (handled in toolExecutor).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveCropAlias } from "../cropAliases.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DISEASE_DIR = path.join(__dirname, "..", "..", "data", "diseases");

let _cache = null;

function load(dir = DISEASE_DIR) {
  const cache = { dir, crops: {}, list: [] };
  if (!fs.existsSync(dir)) return cache;
  for (const name of fs.readdirSync(dir).sort()) {
    const folder = path.join(dir, name);
    if (!fs.statSync(folder).isDirectory()) continue;
    const files = [];
    const images = [];
    for (const f of fs.readdirSync(folder).sort()) {
      const full = path.join(folder, f);
      if (fs.statSync(full).isDirectory()) {
        if (f.toLowerCase() === "images") {
          for (const img of fs.readdirSync(full).sort()) {
            if (/\.(jpe?g|png)$/i.test(img)) {
              images.push({
                filename: img,
                disease: img.replace(/\.[^.]+$/, "").replace(/_/g, " "),
                url: `/disease-images/${name}/${img}`,
              });
            }
          }
        }
        continue;
      }
      if (f.toLowerCase().endsWith(".txt")) {
        files.push({ name: f, content: fs.readFileSync(full, "utf8") });
      }
    }
    cache.crops[name] = { files, images };
    cache.list.push(name);
  }
  return cache;
}

function cache() {
  if (!_cache) _cache = load();
  return _cache;
}

export function _reload(dir) {
  _cache = load(dir);
  return _cache;
}

export function listDiseaseCrops() {
  return [...cache().list];
}

/** Eagerly load ALL disease knowledge into memory; returns a manifest. */
export function preloadAll() {
  const c = cache();
  const crops = c.list.map((name) => {
    const d = c.crops[name];
    return {
      name,
      files: d.files.length,
      images: d.images.length,
      chars: d.files.reduce((s, f) => s + f.content.length, 0),
    };
  });
  return {
    count: crops.length,
    totalChars: crops.reduce((s, x) => s + x.chars, 0),
    crops,
  };
}

export function resolveDiseaseCrop(candidate) {
  if (!candidate || typeof candidate !== "string") return null;
  const c = candidate.trim().toLowerCase();
  if (!c) return null;
  for (const n of cache().list) {
    if (n.toLowerCase() === c) return n; // exact
  }
  return resolveCropAlias(candidate, cache().list); // deterministic alias map
}

/**
 * @param {string} crop
 * @returns {{ok:boolean, crop?:string, files?:object[], images?:object[], error?:string, available?:string[]}}
 */
export function getDiseaseKnowledge(crop) {
  const c = cache();
  const resolved = resolveDiseaseCrop(crop);
  if (!resolved) {
    return {
      ok: false,
      error: `No dedicated disease file for "${crop}". Use crop knowledge pest/disease section.`,
      available: [...c.list],
    };
  }
  const data = c.crops[resolved];
  return { ok: true, crop: resolved, files: data.files, images: data.images };
}
