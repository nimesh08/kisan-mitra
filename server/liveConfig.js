/**
 * liveConfig.js — builds the BidiGenerateContent `setup` message for a new
 * Gemini Live session. Injects the crop mapping into the LLM context (so the
 * model resolves messy/vernacular crop names itself), declares the 5 tools,
 * enables audio + transcription, and tunes VAD so barge-in is responsive.
 */
import { SYSTEM_PROMPT } from "./prompt.js";
import { availableCrops } from "./knowledge.js";
import { renderCropMappingForPrompt } from "./cropAliases.js";

/** Full system instruction = behavior prompt + injected crop list/mapping. */
export function buildSystemInstruction() {
  const crops = availableCrops();
  return (
    SYSTEM_PROMPT +
    "\n\nCROP NAME RESOLUTION (important):\n" +
    "- These are the ONLY valid crops: " + crops.join(", ") + ".\n" +
    "- The farmer may name the crop in ANY language or misspell it many ways. YOU map what they say to the EXACT canonical English name from the list below, and pass THAT exact name to get_crop_knowledge / get_disease_knowledge. Do NOT invent crops.\n" +
    "- If you cannot confidently map it, ask the farmer to confirm which crop it is.\n" +
    "Canonical crop -> common names/aliases:\n" +
    renderCropMappingForPrompt()
  );
}

/** The 5 tool function declarations exposed to the live model. */
export const FUNCTION_DECLARATIONS = [
  {
    name: "get_crop_knowledge",
    description:
      "Get package-of-practices knowledge (varieties, sowing, fertiliser, irrigation, pest & disease management, harvest) for one oilseed crop. Pass the EXACT canonical crop name.",
    parameters: {
      type: "OBJECT",
      properties: {
        crop: { type: "STRING", description: "Canonical crop name, e.g. Sunflower, Groundnut, Soybean" },
      },
      required: ["crop"],
    },
  },
  {
    name: "get_disease_knowledge",
    description:
      "Get disease tables (symptoms, control measures, chemical dose, reference images) for one crop. Use for diagnosis. If it returns ok:false, call get_crop_knowledge and use its pest/disease section.",
    parameters: {
      type: "OBJECT",
      properties: {
        crop: { type: "STRING", description: "Canonical crop name" },
      },
      required: ["crop"],
    },
  },
  {
    name: "get_kvk_contact",
    description:
      "Get the local Krishi Vigyan Kendra (KVK) office name + phone for a district, to escalate to a human expert. Falls back to the national Kisan Call Centre if the district is unknown.",
    parameters: {
      type: "OBJECT",
      properties: {
        district: { type: "STRING", description: "District name, e.g. Bengaluru Rural, Mysuru" },
      },
      required: ["district"],
    },
  },
  {
    name: "create_case_card",
    description:
      "Show the farmer a summary card of the diagnosis and remedy. Call once you have identified the problem and given advice.",
    parameters: {
      type: "OBJECT",
      properties: {
        crop: { type: "STRING" },
        disease: { type: "STRING", description: "The diagnosed disease/pest/problem" },
        severity: { type: "STRING", enum: ["LOW", "MEDIUM", "HIGH"] },
        summary: { type: "STRING", description: "One-line summary in the farmer's language" },
        dos: { type: "ARRAY", items: { type: "STRING" }, description: "What to do" },
        donts: { type: "ARRAY", items: { type: "STRING" }, description: "What to avoid" },
        chemical: { type: "STRING", description: "Chemical + exact dose, if any (e.g. mancozeb 3 g/L)" },
        kvkName: { type: "STRING" },
        kvkPhone: { type: "STRING" },
      },
      required: ["crop", "disease", "severity"],
    },
  },
  {
    name: "end_call",
    description:
      "End the call gracefully. Call this when the farmer asks to cut/end the call (in any language), or after wrapping up when time is nearly over.",
    parameters: {
      type: "OBJECT",
      properties: {
        reason: { type: "STRING", description: "e.g. user_request, time_up, resolved" },
      },
    },
  },
];

/**
 * Build the setup message. Notably: NO session_resumption (isolation),
 * response_modalities AUDIO (+ transcription for captions), VAD tuned for
 * responsive barge-in.
 * @param {string} model  e.g. "models/gemini-3.1-flash-live-preview"
 */
export function buildSetup(model) {
  return {
    setup: {
      model,
      generationConfig: { responseModalities: ["AUDIO"] },
      systemInstruction: { parts: [{ text: buildSystemInstruction() }] },
      tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
          endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
          prefixPaddingMs: 100,
          silenceDurationMs: 600,
        },
        activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
      },
    },
  };
}
