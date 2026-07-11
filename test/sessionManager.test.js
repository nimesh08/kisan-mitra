import { test } from "node:test";
import assert from "node:assert/strict";
import { SessionManager, newCallId } from "../server/sessionManager.js";

test("newCallId returns unique unguessable ids", () => {
  const a = newCallId();
  const b = newCallId();
  assert.match(a, /^call-[0-9a-f]{8}$/);
  assert.notEqual(a, b);
});

test("create returns an isolated session object", () => {
  const m = new SessionManager({ maxSessions: 8 });
  const s1 = m.create("c1");
  const s2 = m.create("c2");
  // independent state bags — mutating one must not affect the other
  s1.state.crop = "Sunflower";
  assert.equal(s2.state.crop, undefined);
  assert.notEqual(s1.state, s2.state);
  assert.equal(m.activeCount, 2);
});

test("two concurrent sessions never share state (multi-user isolation)", () => {
  const m = new SessionManager();
  const farmerA = m.create("A", { language: "kannada" });
  const farmerB = m.create("B", { language: "hindi" });
  farmerA.state.lastDisease = "Alternaria leaf spot";
  assert.equal(farmerB.state.lastDisease, undefined);
  assert.equal(farmerA.language, "kannada");
  assert.equal(farmerB.language, "hindi");
});

test("cap is enforced (CAPACITY_FULL at maxSessions)", () => {
  const m = new SessionManager({ maxSessions: 2 });
  m.create("a");
  m.create("b");
  assert.equal(m.canAccept(), false);
  assert.throws(() => m.create("c"), /CAPACITY_FULL/);
  assert.equal(m.activeCount, 2);
});

test("duplicate active id is rejected", () => {
  const m = new SessionManager();
  m.create("dup");
  assert.throws(() => m.create("dup"), /DUPLICATE_SESSION/);
});

test("destroy removes the session and frees capacity", () => {
  const m = new SessionManager({ maxSessions: 1 });
  m.create("x");
  assert.equal(m.canAccept(), false);
  assert.equal(m.destroy("x"), true);
  assert.equal(m.activeCount, 0);
  assert.equal(m.canAccept(), true);
  assert.equal(m.destroy("x"), false); // already gone
});

test("destroy runs the close() hook exactly once", () => {
  const m = new SessionManager();
  let closed = 0;
  m.create("y", { close: () => (closed += 1) });
  m.destroy("y");
  m.destroy("y"); // no-op
  assert.equal(closed, 1);
});

test("a close() hook that throws does not break teardown", () => {
  const m = new SessionManager();
  m.create("z", { close: () => { throw new Error("boom"); } });
  assert.doesNotThrow(() => m.destroy("z"));
  assert.equal(m.activeCount, 0);
});

test("NO RESUMPTION: recreating a destroyed id yields a fresh session", async () => {
  const m = new SessionManager();
  const first = m.create("same");
  first.state.history = ["old farmer chat"];
  m.destroy("same");
  await new Promise((r) => setTimeout(r, 2));
  const second = m.create("same");
  // brand new object: no inherited history, different creation time
  assert.equal(second.state.history, undefined);
  assert.notEqual(second.createdAt, first.createdAt);
});

test("get/has behave for known and unknown ids", () => {
  const m = new SessionManager();
  m.create("known");
  assert.equal(m.has("known"), true);
  assert.ok(m.get("known"));
  assert.equal(m.has("nope"), false);
  assert.equal(m.get("nope"), null);
});

test("destroyAll clears everything and runs all hooks", () => {
  const m = new SessionManager();
  let closes = 0;
  m.create("1", { close: () => closes++ });
  m.create("2", { close: () => closes++ });
  m.destroyAll();
  assert.equal(m.activeCount, 0);
  assert.equal(closes, 2);
});

test("constructor rejects invalid maxSessions", () => {
  assert.throws(() => new SessionManager({ maxSessions: 0 }));
  assert.throws(() => new SessionManager({ maxSessions: -3 }));
  assert.throws(() => new SessionManager({ maxSessions: 1.5 }));
});
