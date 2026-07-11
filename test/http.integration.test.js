import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { server, sessions } from "../server/index.js";

let base;

before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  sessions.destroyAll();
  server.close();
});

test("GET /health reports ok, model and capacity", async () => {
  const r = await fetch(base + "/health");
  const j = await r.json();
  assert.equal(j.status, "ok");
  assert.match(j.model, /live/i);
  assert.ok(j.maxSessions >= 1);
  assert.equal(typeof j.activeCalls, "number");
});

test("GET /api/kvk resolves a known district", async () => {
  const r = await fetch(base + "/api/kvk?district=Mysuru");
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.ok(j.contact.phone);
});

test("GET /api/kvk falls back for unknown district", async () => {
  const r = await fetch(base + "/api/kvk?district=Narnia");
  const j = await r.json();
  assert.equal(j.matched, false);
  assert.match(j.contact.phone, /1800-180-1551/);
});

test("serves the Kisan Mitra app shell", async () => {
  const r = await fetch(base + "/");
  const html = await r.text();
  assert.match(html, /Kisan Mitra/);
  assert.match(html, /Start Crop Call/);
});

test("unknown disease image path 404s (no traversal)", async () => {
  const r = await fetch(base + "/disease-images/..%2f..%2fpackage.json");
  assert.ok(r.status === 404 || r.status === 400);
});
