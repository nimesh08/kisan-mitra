import { test } from "node:test";
import assert from "node:assert/strict";
import { getKvkContact, listDistricts } from "../server/tools/kvk.js";

test("exact district match returns its KVK", () => {
  const r = getKvkContact("Bengaluru Rural");
  assert.equal(r.matched, true);
  assert.equal(r.contact.district, "Bengaluru Rural");
  assert.match(r.contact.phone, /\d/);
});

test("fuzzy district match works", () => {
  const r = getKvkContact("bengaluru urban");
  assert.equal(r.matched, true);
  assert.equal(r.contact.district, "Bengaluru Urban");
});

test("unknown district falls back to national Kisan Call Centre", () => {
  const r = getKvkContact("Atlantis");
  assert.equal(r.matched, false);
  assert.match(r.contact.phone, /1800-180-1551/);
});

test("empty district also falls back safely", () => {
  const r = getKvkContact("");
  assert.equal(r.ok, true);
  assert.equal(r.matched, false);
});

test("listDistricts returns the seeded districts", () => {
  const d = listDistricts();
  assert.ok(d.includes("Mysuru"));
  assert.ok(d.length >= 5);
});
