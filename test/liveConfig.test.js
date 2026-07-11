import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSetup, buildSystemInstruction, FUNCTION_DECLARATIONS } from "../server/liveConfig.js";

test("declares exactly the 5 tools", () => {
  const names = FUNCTION_DECLARATIONS.map((f) => f.name);
  assert.deepEqual(names, [
    "get_crop_knowledge",
    "get_disease_knowledge",
    "get_kvk_contact",
    "create_case_card",
    "end_call",
  ]);
});

test("system instruction injects the crop list + mapping + guardrails", () => {
  const sys = buildSystemInstruction();
  assert.match(sys, /Kisan Mitra/);
  assert.match(sys, /CROP NAME RESOLUTION/);
  // crop list present
  for (const c of ["Sunflower", "Groundnut", "Soybean"]) assert.ok(sys.includes(c));
  // vernacular aliases injected
  assert.match(sys, /moongphali/);
  assert.match(sys, /surajmukhi/);
  // guardrails present
  assert.match(sys, /can't answer/i);
  assert.match(sys, /only help with/i);
});

test("setup uses the live model, AUDIO modality + transcription, NO resumption", () => {
  const setup = buildSetup("models/gemini-3.1-flash-live-preview").setup;
  assert.equal(setup.model, "models/gemini-3.1-flash-live-preview");
  assert.deepEqual(setup.generationConfig.responseModalities, ["AUDIO"]);
  assert.ok(setup.inputAudioTranscription);
  assert.ok(setup.outputAudioTranscription);
  assert.equal(setup.sessionResumption, undefined, "must NOT enable session resumption");
  assert.ok(setup.systemInstruction.parts[0].text.length > 500);
});

test("setup tunes VAD for barge-in", () => {
  const setup = buildSetup("m").setup;
  const vad = setup.realtimeInputConfig.automaticActivityDetection;
  assert.ok(vad.startOfSpeechSensitivity);
  assert.equal(setup.realtimeInputConfig.activityHandling, "START_OF_ACTIVITY_INTERRUPTS");
});

test("create_case_card declares severity enum + array fields", () => {
  const card = FUNCTION_DECLARATIONS.find((f) => f.name === "create_case_card");
  assert.deepEqual(card.parameters.properties.severity.enum, ["LOW", "MEDIUM", "HIGH"]);
  assert.equal(card.parameters.properties.dos.type, "ARRAY");
});
