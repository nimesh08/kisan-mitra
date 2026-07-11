// LiveClient: thin wrapper over the WS to our relay + a 24kHz audio player
// with instant barge-in flush. Protocol matches server/index.js.
class LiveClient {
  constructor() {
    this.ws = null;
    this.onReady = () => {};
    this.onAudio = () => {};
    this.onUserText = () => {};
    this.onAiText = () => {};
    this.onInterrupted = () => {};
    this.onTurnComplete = () => {};
    this.onCaseCard = () => {};
    this.onGoAway = () => {};
    this.onEnded = () => {};
    this.onBusy = () => {};
    this.onClose = () => {};
    this.ready = false;
  }
  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    this.ws = new WebSocket(`${proto}://${location.host}/live`);
    this.ws.addEventListener("message", (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      switch (m.type) {
        case "ready": this.ready = true; this.onReady(m); break;
        case "audio": this.onAudio(m.data); break;
        case "userText": this.onUserText(m.text); break;
        case "aiText": this.onAiText(m.text); break;
        case "interrupted": this.onInterrupted(); break;
        case "turnComplete": this.onTurnComplete(); break;
        case "caseCard": this.onCaseCard(m.card); break;
        case "goAway": this.onGoAway(m); break;
        case "busy": this.onBusy(); break;
        case "ended": this.onEnded(m.reason); break;
      }
    });
    this.ws.addEventListener("close", () => { this.ready = false; this.onClose(); });
    this.ws.addEventListener("error", () => { this.ready = false; });
  }
  _send(o) { if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(o)); }
  sendAudio(b64) { this._send({ type: "audio", data: b64 }); }
  sendFrame(b64) { this._send({ type: "frame", data: b64 }); }
  sendText(text) { this._send({ type: "text", text }); }
  hangup() { this._send({ type: "end" }); }
  close() { try { this.ws && this.ws.close(); } catch {} }
}

// 24kHz PCM16 playback queue with gapless scheduling + flush on interrupt.
class AudioPlayer {
  constructor() { this.ctx = null; this.nextAt = 0; this.sources = new Set(); }
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  playB64(b64) {
    this.ensure();
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const pcm = new Int16Array(bytes.buffer);
    const f32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
    const buf = this.ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const now = this.ctx.currentTime;
    const at = Math.max(now + 0.02, this.nextAt);
    src.start(at);
    this.nextAt = at + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }
  flush() {
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources.clear();
    this.nextAt = 0;
  }
}

window.LiveClient = LiveClient;
window.AudioPlayer = AudioPlayer;
