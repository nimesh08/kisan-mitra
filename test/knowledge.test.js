import { test } from "node:test";
import assert from "node:assert/strict";
import { preloadKnowledge, availableCrops, knowledgeSummary } from "../server/knowledge.js";

test("preloadKnowledge loads ALL 9 crops into memory with real content", () => {
  const m = preloadKnowledge();
  assert.equal(m.crops.count, 9, "all 9 oilseed crops must be resident");
  for (const c of m.crops.crops) {
    assert.ok(c.files >= 1, `${c.name} must have at least one file in memory`);
    assert.ok(c.chars > 500, `${c.name} must have real content loaded (${c.chars} chars)`);
  }
  // General/Soil attached
  assert.ok(m.crops.general.files >= 1);
  assert.ok(m.crops.general.chars > 100);
});

test("disease + KVK knowledge is resident in memory", () => {
  const m = preloadKnowledge();
  assert.ok(m.diseases.count >= 1);
  const sunflower = m.diseases.crops.find((c) => c.name === "Sunflower");
  assert.ok(sunflower && sunflower.chars > 500);
  assert.ok(sunflower.images >= 5);
  assert.ok(m.kvk.districts >= 5);
  assert.equal(m.kvk.hasFallback, true);
});

test("total in-memory footprint is reported and substantial", () => {
  const m = preloadKnowledge();
  assert.ok(m.totalCharsInMemory > 200000, "expect >200k chars across all crops");
});

test("preloadKnowledge is idempotent (same manifest object)", () => {
  const a = preloadKnowledge();
  const b = preloadKnowledge();
  assert.equal(a, b);
});

test("availableCrops + summary reflect the loaded set", () => {
  assert.equal(availableCrops().length, 9);
  assert.match(knowledgeSummary(), /9 crops/);
});
