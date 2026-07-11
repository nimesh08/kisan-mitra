import { test } from "node:test";
import assert from "node:assert/strict";
import { getDiseaseKnowledge, listDiseaseCrops } from "../server/tools/diseaseKnowledge.js";

test("Sunflower disease file loads with real content", () => {
  const r = getDiseaseKnowledge("Sunflower");
  assert.equal(r.ok, true);
  assert.equal(r.crop, "Sunflower");
  assert.ok(r.files.length >= 1);
  const text = r.files.map((f) => f.content).join("\n");
  // spot-check known diseases from the ICAR file
  assert.match(text, /Alternaria/i);
  assert.match(text, /Powdery mildew/i);
  assert.match(text, /mancozeb/i); // a chemical control
});

test("Sunflower disease reference images are indexed (via vernacular alias)", () => {
  const r = getDiseaseKnowledge("surajmukhi"); // Hindi alias -> Sunflower
  assert.equal(r.ok, true);
  assert.equal(r.crop, "Sunflower");
  assert.ok(r.images.length >= 5, "expect 5 reference images");
  assert.ok(r.images.every((i) => i.url.startsWith("/disease-images/")));
});

test("unpopulated crop returns ok:false so caller falls back to crop knowledge", () => {
  const r = getDiseaseKnowledge("Groundnut");
  assert.equal(r.ok, false);
  assert.ok(Array.isArray(r.available));
});

test("listDiseaseCrops includes Sunflower", () => {
  assert.ok(listDiseaseCrops().includes("Sunflower"));
});
