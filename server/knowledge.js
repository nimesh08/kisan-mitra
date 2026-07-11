/**
 * knowledge.js — the in-memory knowledge store.
 *
 * At server startup we call preloadKnowledge() ONCE. It eagerly loads EVERY
 * crop's package-of-practices, all disease tables + images, and the KVK
 * directory into memory. After this, every tool call is served from RAM (no
 * disk reads on the hot path), so the live LLM can rely on instant, complete
 * grounding data for all 9 oilseed crops.
 *
 * This is where "load all crops into memory" happens.
 */
import * as crop from "./tools/cropKnowledge.js";
import * as disease from "./tools/diseaseKnowledge.js";
import * as kvk from "./tools/kvk.js";

let _manifest = null;

/**
 * Force-load all knowledge into memory and return a manifest (proof of what
 * is resident). Idempotent — safe to call again; returns the cached manifest.
 */
export function preloadKnowledge() {
  if (_manifest) return _manifest;
  const crops = crop.preloadAll();
  const diseases = disease.preloadAll();
  const kvkData = kvk.preloadAll();
  _manifest = {
    loadedAt: new Date().toISOString(),
    crops,
    diseases,
    kvk: kvkData,
    totalCharsInMemory: crops.totalChars + crops.general.chars + diseases.totalChars,
  };
  return _manifest;
}

/** The list of crops the LLM can be told about (for prompt/health). */
export function availableCrops() {
  return crop.listCrops();
}

/** Human-readable one-line summary for logs. */
export function knowledgeSummary() {
  const m = preloadKnowledge();
  return `${m.crops.count} crops, ${m.diseases.count} disease set(s), ${m.kvk.districts} KVK districts, ${(m.totalCharsInMemory / 1000).toFixed(0)}k chars in memory`;
}
