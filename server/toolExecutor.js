/**
 * toolExecutor — maps a Live API functionCall to a functionResponse.
 *
 * The live model emits serverContent.toolCall.functionCalls[] (each {id,name,args});
 * we run the matching function and return toolResponse.functionResponses[]
 * (each {id,name,response}). Pure dispatch + light shaping; no network.
 */
import { getCropKnowledge } from "./tools/cropKnowledge.js";
import { getDiseaseKnowledge } from "./tools/diseaseKnowledge.js";
import { getKvkContact } from "./tools/kvk.js";

export const TOOL_NAMES = [
  "get_crop_knowledge",
  "get_disease_knowledge",
  "get_kvk_contact",
  "create_case_card",
  "end_call",
];

const SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH"]);

function asArray(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (v == null || v === "") return [];
  return [String(v)];
}

/** Normalise loose model args into a clean case-card object for the UI. */
export function normalizeCard(args = {}) {
  const sev = String(args.severity || "MEDIUM").toUpperCase();
  return {
    crop: args.crop ? String(args.crop) : "",
    disease: args.disease ? String(args.disease) : "",
    severity: SEVERITIES.has(sev) ? sev : "MEDIUM",
    summary: args.summary ? String(args.summary) : "",
    dos: asArray(args.dos),
    donts: asArray(args.donts),
    chemical: args.chemical ? String(args.chemical) : "",
    kvkPhone: args.kvkPhone ? String(args.kvkPhone) : "",
    kvkName: args.kvkName ? String(args.kvkName) : "",
  };
}

/**
 * Execute a single tool.
 * @param {string} name
 * @param {object} args
 * @param {{onCaseCard?:Function,onEndCall?:Function}} [ctx]
 */
export async function executeTool(name, args = {}, ctx = {}) {
  switch (name) {
    case "get_crop_knowledge":
      return getCropKnowledge(args.crop);
    case "get_disease_knowledge":
      return getDiseaseKnowledge(args.crop);
    case "get_kvk_contact":
      return getKvkContact(args.district);
    case "create_case_card": {
      const card = normalizeCard(args);
      if (typeof ctx.onCaseCard === "function") ctx.onCaseCard(card);
      return { ok: true, card };
    }
    case "end_call": {
      const reason = args.reason ? String(args.reason) : "user_request";
      if (typeof ctx.onEndCall === "function") ctx.onEndCall(reason);
      return { ok: true, ended: true, reason };
    }
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

/**
 * Handle a batch of functionCalls from one toolCall event.
 * @param {{id?:string,name:string,args?:object}[]} functionCalls
 * @param {object} [ctx]
 * @returns {Promise<{id?:string,name:string,response:object}[]>}
 */
export async function handleToolCalls(functionCalls = [], ctx = {}) {
  const responses = [];
  for (const call of functionCalls) {
    const response = await executeTool(call.name, call.args || {}, ctx);
    responses.push({ id: call.id, name: call.name, response });
  }
  return responses;
}
