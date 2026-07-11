import "dotenv/config";
import express from "express";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";

import { SessionManager, newCallId } from "./sessionManager.js";
import { buildSetup } from "./liveConfig.js";
import { handleToolCalls } from "./toolExecutor.js";
import { preloadKnowledge, knowledgeSummary } from "./knowledge.js";
import { getKvkContact } from "./tools/kvk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const PORT = Number(process.env.PORT || 8080);
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.LIVE_MODEL || "models/gemini-3.1-flash-live-preview";
const MAX_SESSIONS = Number(process.env.MAX_SESSIONS || 8);
const SOFT_LIMIT_MS = Number(process.env.SOFT_LIMIT_MS || 120000); // 2:00
const HARD_LIMIT_MS = Number(process.env.HARD_LIMIT_MS || 150000); // 2:30
const GOOGLE_WS =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

if (!KEY) {
  console.error("GEMINI_API_KEY missing — copy .env.example to .env");
  process.exit(1);
}

// ---- Load all knowledge into memory once at startup ----
preloadKnowledge();
console.log("[knowledge] " + knowledgeSummary());

const sessions = new SessionManager({ maxSessions: MAX_SESSIONS });

// ---------- HTTP ----------
export const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, "app")));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", model: MODEL, activeCalls: sessions.activeCount, maxSessions: MAX_SESSIONS });
});

// Optional REST for KVK (handy for the case-card UI / testing)
app.get("/api/kvk", (req, res) => {
  res.json(getKvkContact(String(req.query.district || "")));
});

// Serve disease reference images: /disease-images/<Crop>/<file>
app.get("/disease-images/:crop/:file", (req, res) => {
  const crop = path.basename(req.params.crop);
  const file = path.basename(req.params.file);
  const p = path.join(ROOT, "data", "diseases", crop, "images", file);
  if (!p.startsWith(path.join(ROOT, "data", "diseases")) || !fs.existsSync(p)) {
    return res.status(404).end();
  }
  res.sendFile(p);
});

// ---------- helpers ----------
function send(ws, obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// ---------- WebSocket relay ----------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/live" });

wss.on("connection", (client) => {
  // Capacity guard — protects upstream quota; caller sees a busy screen.
  if (!sessions.canAccept()) {
    send(client, { type: "busy" });
    client.close(1013, "capacity");
    return;
  }

  const callId = newCallId();
  const upstream = new WebSocket(GOOGLE_WS, { headers: { "x-goog-api-key": KEY } });
  const pending = []; // client msgs before upstream opens
  let ended = false;

  const timers = { soft: null, hard: null };

  function teardown(reason = "closed") {
    if (ended) return;
    ended = true;
    clearTimeout(timers.soft);
    clearTimeout(timers.hard);
    try { if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) upstream.close(); } catch {}
    try { send(client, { type: "ended", reason }); } catch {}
    try { client.close(); } catch {}
    sessions.destroy(callId);
    console.log(`[${callId}] torn down (${reason}); active=${sessions.activeCount}`);
  }

  // Register the isolated session (close hook guarantees upstream dies).
  try {
    sessions.create(callId, {
      close: () => {
        try { if (upstream.readyState <= WebSocket.OPEN) upstream.close(); } catch {}
      },
    });
  } catch {
    send(client, { type: "busy" });
    client.close(1013, "capacity");
    return;
  }
  console.log(`[${callId}] connected; active=${sessions.activeCount}`);

  // Graceful end after the model's goodbye (from end_call tool).
  function gracefulEnd(reason) {
    setTimeout(() => teardown(reason), 3500);
  }

  const toolCtx = {
    onCaseCard: (card) => send(client, { type: "caseCard", card }),
    onEndCall: (reason) => gracefulEnd(reason || "end_call"),
  };

  // ---- upstream (Gemini) ----
  upstream.on("open", () => {
    upstream.send(JSON.stringify(buildSetup(MODEL)));
    // Timers begin once the session is live.
    timers.soft = setTimeout(() => {
      // Nudge the model to wrap up (it will create_case_card + end_call).
      upstream.readyState === WebSocket.OPEN &&
        upstream.send(JSON.stringify({
          clientContent: {
            turns: [{ role: "user", parts: [{ text: "[system: only ~30 seconds of call time left — wrap up now: give the case card and a short goodbye, then end the call]" }] }],
            turnComplete: true,
          },
        }));
    }, SOFT_LIMIT_MS);
    timers.hard = setTimeout(() => teardown("time_up"), HARD_LIMIT_MS);
    while (pending.length) upstream.send(pending.shift());
  });

  upstream.on("message", async (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.setupComplete) {
      send(client, { type: "ready", callId });
      // Trigger the opening greeting.
      upstream.send(JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text: "[system: the farmer has joined and is pointing the camera at their crop. Greet them now as Kisan Mitra and ask them to show the crop.]" }] }],
          turnComplete: true,
        },
      }));
      return;
    }

    if (msg.toolCall && Array.isArray(msg.toolCall.functionCalls)) {
      const responses = await handleToolCalls(msg.toolCall.functionCalls, toolCtx);
      send2upstream({ toolResponse: { functionResponses: responses } });
      return;
    }

    if (msg.goAway) {
      send(client, { type: "goAway", timeLeft: msg.goAway.timeLeft });
      // Give the model a moment to close out, then hard-stop.
      setTimeout(() => teardown("go_away"), 5000);
      return;
    }

    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) send(client, { type: "interrupted" });
      if (sc.inputTranscription?.text) send(client, { type: "userText", text: sc.inputTranscription.text });
      if (sc.outputTranscription?.text) send(client, { type: "aiText", text: sc.outputTranscription.text });
      if (sc.modelTurn?.parts) {
        for (const p of sc.modelTurn.parts) {
          if (p.inlineData?.data) send(client, { type: "audio", data: p.inlineData.data });
        }
      }
      if (sc.turnComplete) send(client, { type: "turnComplete" });
    }
  });

  upstream.on("close", () => teardown("upstream_closed"));
  upstream.on("error", (e) => { console.error(`[${callId}] upstream error: ${e.message}`); teardown("upstream_error"); });

  function send2upstream(obj) {
    const s = JSON.stringify(obj);
    if (upstream.readyState === WebSocket.OPEN) upstream.send(s);
    else pending.push(s);
  }

  // ---- client (browser) ----
  client.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    switch (msg.type) {
      case "audio":
        send2upstream({ realtimeInput: { audio: { data: msg.data, mimeType: "audio/pcm;rate=16000" } } });
        break;
      case "frame":
        send2upstream({ realtimeInput: { video: { data: msg.data, mimeType: "image/jpeg" } } });
        break;
      case "text":
        send2upstream({ clientContent: { turns: [{ role: "user", parts: [{ text: String(msg.text || "") }] }], turnComplete: true } });
        break;
      case "end":
        teardown("user_hangup");
        break;
    }
  });

  client.on("close", () => teardown("client_closed"));
  client.on("error", () => teardown("client_error"));
});

// Clean shutdown
function shutdown() {
  console.log("shutting down; destroying all sessions");
  sessions.destroyAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Only listen when run directly (so tests can import `app` without a port).
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  server.listen(PORT, () => {
    console.log(`KrishiCall (Kisan Mitra) → http://localhost:${PORT}`);
    console.log(`Live model: ${MODEL} · max concurrent calls: ${MAX_SESSIONS}`);
  });
}

export { server, sessions };
