// Kisan Mitra front-end app logic.
const $ = (id) => document.getElementById(id);
const screens = { start: $("startScreen"), call: $("callScreen"), busy: $("busyScreen") };
function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

let client = null, player = null, stream = null;
let micCtx = null, micNode = null, micSrc = null;
let frameTimer = null, callTimer = null, callStart = 0;
let muted = false, facing = "environment";
let userTxt = "", aiTxt = "";

function abToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}
function setStatus(t, cls) { const e = $("status"); e.textContent = t; e.className = "pill " + cls; }
function notice(t, ms = 4000) { const n = $("notice"); n.textContent = t; n.classList.remove("hidden"); clearTimeout(n._t); n._t = setTimeout(() => n.classList.add("hidden"), ms); }
function trim(s) { return s.length > 160 ? "…" + s.slice(-160) : s; }
function renderCaps() { $("userCap").textContent = trim(userTxt); $("aiCap").textContent = trim(aiTxt); }

async function startCall() {
  $("startBtn").disabled = true; // no double-tap -> no double session
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: { facingMode: facing, width: { ideal: 1280 } },
    });
  } catch (e) {
    alert("Please allow camera & microphone. " + e.message);
    $("startBtn").disabled = false;
    return;
  }
  show("call");
  $("camera").srcObject = stream;
  setStatus("Connecting…", "connecting");
  userTxt = ""; aiTxt = ""; renderCaps();

  player = new AudioPlayer();
  player.ensure();

  client = new LiveClient();
  client.onReady = async () => {
    setStatus("● LIVE", "live");
    callStart = Date.now();
    callTimer = setInterval(() => {
      const s = Math.floor((Date.now() - callStart) / 1000);
      $("timer").textContent = `${String((s / 60) | 0).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
    }, 500);
    await startMic();
    startFrames();
  };
  client.onAudio = (b64) => player.playB64(b64);
  client.onInterrupted = () => player.flush();
  client.onUserText = (t) => { userTxt += t; renderCaps(); };
  client.onAiText = (t) => { aiTxt += t; renderCaps(); };
  client.onTurnComplete = () => setTimeout(() => { userTxt = ""; aiTxt = ""; renderCaps(); }, 4000);
  client.onCaseCard = showCaseCard;
  client.onGoAway = () => notice("Call ending soon…");
  client.onBusy = () => { cleanup(); show("busy"); };
  client.onEnded = () => endCall();
  client.onClose = () => { if (screens.call.classList.contains("active")) endCall(); };
  client.connect();
}

async function startMic() {
  micCtx = new (window.AudioContext || window.webkitAudioContext)();
  await micCtx.audioWorklet.addModule("audio-processor.js");
  micSrc = micCtx.createMediaStreamSource(stream);
  micNode = new AudioWorkletNode(micCtx, "pcm-capture");
  const silent = micCtx.createGain(); silent.gain.value = 0;
  micNode.port.onmessage = (e) => { if (!muted && client && client.ready) client.sendAudio(abToB64(e.data)); };
  micSrc.connect(micNode); micNode.connect(silent); silent.connect(micCtx.destination);
}

function startFrames() {
  const video = $("camera");
  const canvas = document.createElement("canvas");
  frameTimer = setInterval(() => {
    if (!client || !client.ready || video.videoWidth === 0) return;
    const w = 640, h = Math.round((video.videoHeight / video.videoWidth) * 640);
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(video, 0, 0, w, h);
    client.sendFrame(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
  }, 1000);
}

function cleanup() {
  clearInterval(frameTimer); clearInterval(callTimer);
  try { micCtx && micCtx.close(); } catch {}
  if (stream) stream.getTracks().forEach((t) => t.stop());
  try { player && player.flush(); } catch {}
  stream = null; micCtx = null;
}

function endCall() {
  try { client && client.hangup(); } catch {}
  try { client && client.close(); } catch {}
  cleanup();
  client = null; player = null;
  $("caseModal").classList.add("hidden");
  $("startBtn").disabled = false;
  userTxt = ""; aiTxt = ""; renderCaps();
  if (!screens.busy.classList.contains("active")) show("start");
}

function showCaseCard(card) {
  $("cardDisease").textContent = card.disease || "—";
  $("cardCrop").textContent = card.crop || "";
  $("cardSev").textContent = card.severity || "—";
  $("cardSev").className = "sev " + (card.severity || "");
  $("cardSummary").textContent = card.summary || "";
  $("cardDos").innerHTML = (card.dos || []).map((d) => `<li>${escapeHtml(d)}</li>`).join("");
  $("cardDonts").innerHTML = (card.donts || []).map((d) => `<li>${escapeHtml(d)}</li>`).join("");
  const chem = $("cardChem");
  if (card.chemical) { chem.textContent = "💊 " + card.chemical; chem.classList.remove("hidden"); } else chem.classList.add("hidden");
  const kvk = $("cardKvk");
  if (card.kvkPhone) { kvk.innerHTML = `📞 <b>${escapeHtml(card.kvkName || "KVK")}</b>: ${escapeHtml(card.kvkPhone)}`; kvk.classList.remove("hidden"); } else kvk.classList.add("hidden");
  // WhatsApp share text
  const parts = [`*Kisan Mitra — Case Card*`, `Crop: ${card.crop}`, `Problem: ${card.disease} (${card.severity})`];
  if (card.summary) parts.push(card.summary);
  if ((card.dos || []).length) parts.push("Do: " + card.dos.join("; "));
  if ((card.donts || []).length) parts.push("Don't: " + card.donts.join("; "));
  if (card.chemical) parts.push("Spray: " + card.chemical);
  if (card.kvkPhone) parts.push(`KVK: ${card.kvkName || ""} ${card.kvkPhone}`);
  $("waShare").href = "https://wa.me/?text=" + encodeURIComponent(parts.join("\n"));
  $("caseModal").classList.remove("hidden");
}

function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

// ---- controls ----
$("startBtn").addEventListener("click", startCall);
$("endBtn").addEventListener("click", endCall);
$("busyBackBtn").addEventListener("click", () => show("start"));
$("cardClose").addEventListener("click", () => $("caseModal").classList.add("hidden"));
$("muteBtn").addEventListener("click", () => {
  muted = !muted;
  $("muteBtn").classList.toggle("muted", muted);
  $("muteBtn").textContent = muted ? "🔇" : "🎙️";
});
$("flipBtn").addEventListener("click", async () => {
  facing = facing === "environment" ? "user" : "environment";
  if (!stream) return;
  try {
    const v = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 } } });
    const nt = v.getVideoTracks()[0];
    stream.getVideoTracks().forEach((t) => { stream.removeTrack(t); t.stop(); });
    stream.addTrack(nt);
    $("camera").srcObject = stream;
  } catch {}
});
