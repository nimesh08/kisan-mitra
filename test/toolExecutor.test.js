import { test } from "node:test";
import assert from "node:assert/strict";
import {
  executeTool,
  handleToolCalls,
  normalizeCard,
  TOOL_NAMES,
} from "../server/toolExecutor.js";

test("exposes the 5 tool names", () => {
  assert.deepEqual(TOOL_NAMES, [
    "get_crop_knowledge",
    "get_disease_knowledge",
    "get_kvk_contact",
    "create_case_card",
    "end_call",
  ]);
});

test("executeTool dispatches crop/disease/kvk", async () => {
  const crop = await executeTool("get_crop_knowledge", { crop: "soybean" });
  assert.equal(crop.ok, true);
  const dis = await executeTool("get_disease_knowledge", { crop: "Sunflower" });
  assert.equal(dis.ok, true);
  const kvk = await executeTool("get_kvk_contact", { district: "Mysuru" });
  assert.equal(kvk.matched, true);
});

test("normalizeCard coerces loose args and clamps severity", () => {
  const card = normalizeCard({
    crop: "Sunflower",
    disease: "Alternaria leaf spot",
    severity: "critical", // invalid -> MEDIUM
    dos: "remove affected leaves",
    donts: ["overhead watering"],
  });
  assert.equal(card.severity, "MEDIUM");
  assert.deepEqual(card.dos, ["remove affected leaves"]);
  assert.deepEqual(card.donts, ["overhead watering"]);
});

test("create_case_card fires onCaseCard callback", async () => {
  let got = null;
  const r = await executeTool(
    "create_case_card",
    { crop: "Sunflower", disease: "Powdery mildew", severity: "HIGH" },
    { onCaseCard: (c) => (got = c) }
  );
  assert.equal(r.ok, true);
  assert.equal(got.severity, "HIGH");
  assert.equal(got.disease, "Powdery mildew");
});

test("end_call fires onEndCall with reason", async () => {
  let reason = null;
  const r = await executeTool(
    "end_call",
    { reason: "farmer_said_cut" },
    { onEndCall: (x) => (reason = x) }
  );
  assert.equal(r.ended, true);
  assert.equal(reason, "farmer_said_cut");
});

test("unknown tool returns ok:false, never throws", async () => {
  const r = await executeTool("do_magic", {});
  assert.equal(r.ok, false);
});

test("handleToolCalls preserves id + name and returns responses in order", async () => {
  const calls = [
    { id: "1", name: "get_kvk_contact", args: { district: "Kolar" } },
    { id: "2", name: "end_call", args: {} },
  ];
  const res = await handleToolCalls(calls, {});
  assert.equal(res.length, 2);
  assert.equal(res[0].id, "1");
  assert.equal(res[0].name, "get_kvk_contact");
  assert.equal(res[1].response.ended, true);
});
