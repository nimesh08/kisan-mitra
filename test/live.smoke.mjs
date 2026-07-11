// Live smoke test — connects to the REAL Gemini Live API with your key,
// sends a text question, and verifies the full path: setupComplete -> the
// model calls a tool -> we answer -> the model responds. Network + key needed.
//   npm run smoke
import "dotenv/config";
import { WebSocket } from "ws";
import { buildSetup } from "../server/liveConfig.js";
import { handleToolCalls } from "../server/toolExecutor.js";

const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.LIVE_MODEL || "models/gemini-3.1-flash-live-preview";
const URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

if (!KEY) { console.error("GEMINI_API_KEY missing"); process.exit(1); }

const ws = new WebSocket(URL, { headers: { "x-goog-api-key": KEY } });
let gotSetup = false, gotTool = false, gotAudio = false;
const toolsSeen = [];
const t = setTimeout(finish, 30000);

ws.on("open", () => {
  console.log("connecting to", MODEL);
  ws.send(JSON.stringify(buildSetup(MODEL)));
});

ws.on("message", async (raw) => {
  let m; try { m = JSON.parse(raw.toString()); } catch { return; }
  if (m.setupComplete) {
    gotSetup = true;
    console.log("✓ setupComplete");
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: "user", parts: [{ text: "My sunflower leaves have dark brown spots with concentric rings. What disease is this and how do I treat it?" }] }],
        turnComplete: true,
      },
    }));
    return;
  }
  if (m.toolCall?.functionCalls) {
    gotTool = true;
    for (const f of m.toolCall.functionCalls) toolsSeen.push(f.name);
    console.log("✓ toolCall:", m.toolCall.functionCalls.map((f) => `${f.name}(${JSON.stringify(f.args || {})})`).join(", "));
    const responses = await handleToolCalls(m.toolCall.functionCalls, {});
    ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
    return;
  }
  const sc = m.serverContent;
  if (sc?.outputTranscription?.text) process.stdout.write(sc.outputTranscription.text);
  if (sc?.modelTurn?.parts?.some((p) => p.inlineData?.data)) gotAudio = true;
  if (sc?.turnComplete) { console.log("\n✓ turnComplete"); finish(); }
});

ws.on("error", (e) => { console.error("WS error:", e.message); process.exit(1); });

function finish() {
  clearTimeout(t);
  console.log("\n--- smoke result ---");
  console.log("setupComplete:", gotSetup, "| toolCall:", gotTool, toolsSeen.length ? `(${toolsSeen.join(",")})` : "", "| audio:", gotAudio);
  const ok = gotSetup && (gotTool || gotAudio);
  console.log(ok ? "SMOKE PASS ✓" : "SMOKE FAIL ✗");
  try { ws.close(); } catch {}
  process.exit(ok ? 0 : 1);
}
