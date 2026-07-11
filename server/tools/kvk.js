/**
 * get_kvk_contact(district) — resolves a district to its Krishi Vigyan Kendra
 * office + phone from data/kvk-data.json. Falls back to the national Kisan
 * Call Centre when the district is unknown. This is the human-escalation tool.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveName } from "./fuzzy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KVK_PATH = path.join(__dirname, "..", "..", "data", "kvk-data.json");

let _cache = null;

function load(file = KVK_PATH) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return raw;
}

function cache() {
  if (!_cache) _cache = load();
  return _cache;
}

export function _reload(file) {
  _cache = load(file);
  return _cache;
}

export function listDistricts() {
  return cache().districts.map((d) => d.district);
}

/** Eagerly load KVK data into memory; returns a manifest. */
export function preloadAll() {
  const c = cache();
  return { districts: c.districts.length, hasFallback: !!c.fallback };
}

/**
 * @param {string} district
 * @returns {{ok:boolean, matched:boolean, contact:object, district:string}}
 */
export function getKvkContact(district) {
  const c = cache();
  const names = c.districts.map((d) => d.district);
  const resolved = district ? resolveName(district, names, 0.7) : null;
  if (resolved) {
    const hit = c.districts.find((d) => d.district === resolved);
    return { ok: true, matched: true, district: resolved, contact: hit };
  }
  return { ok: true, matched: false, district: district || "unknown", contact: c.fallback };
}
