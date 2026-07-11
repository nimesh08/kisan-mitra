import { test } from "node:test";
import assert from "node:assert/strict";
import { listCrops, resolveCrop, getCropKnowledge } from "../server/tools/cropKnowledge.js";

test("lists all 9 oilseed crops (General excluded)", () => {
  const crops = listCrops();
  for (const c of ["Castor","Groundnut","Linseed","Niger","Rapeseed-mustard","Safflower","Sesame","Soybean","Sunflower"]) {
    assert.ok(crops.includes(c), `missing ${c}`);
  }
  assert.ok(!crops.includes("General"), "General must be excluded from crop list");
});

test("resolves EXACT canonical crop names", () => {
  assert.equal(resolveCrop("Sunflower"), "Sunflower");
  assert.equal(resolveCrop("soybean"), "Soybean");
  assert.equal(resolveCrop("CASTOR"), "Castor");
});

test("resolves multilingual / vernacular aliases (deterministic, no fuzzy)", () => {
  assert.equal(resolveCrop("moongphali"), "Groundnut");   // Hindi
  assert.equal(resolveCrop("shenga"), "Groundnut");        // Kannada
  assert.equal(resolveCrop("sarson"), "Rapeseed-mustard"); // Hindi
  assert.equal(resolveCrop("til"), "Sesame");              // Hindi
  assert.equal(resolveCrop("ellu"), "Sesame");             // Kannada/Tamil
  assert.equal(resolveCrop("surajmukhi"), "Sunflower");    // Hindi
  assert.equal(resolveCrop("soyabean"), "Soybean");        // common misspelling (in alias list)
  assert.equal(resolveCrop("arandi"), "Castor");           // Hindi
});

test("returns null for unknown / arbitrary typo (LLM is expected to map those upstream)", () => {
  assert.equal(resolveCrop("banana"), null);
  assert.equal(resolveCrop("zzzzz"), null);
  assert.equal(resolveCrop(""), null);
  assert.equal(resolveCrop(null), null);
});

test("getCropKnowledge returns files + general for a vernacular name", () => {
  const r = getCropKnowledge("moongphali"); // -> Groundnut
  assert.equal(r.ok, true);
  assert.equal(r.crop, "Groundnut");
  assert.ok(r.files.length >= 1);
  assert.ok(r.files[0].content.length > 100);
  assert.ok(r.general && r.general.files.length >= 1, "General/Soil should attach");
});

test("getCropKnowledge fails gracefully for unknown crop", () => {
  const r = getCropKnowledge("dragonfruit");
  assert.equal(r.ok, false);
  assert.ok(Array.isArray(r.available));
  assert.ok(r.available.includes("Sunflower"));
});
