// AudioWorklet: captures mic audio at the context rate, linearly downsamples
// to 16 kHz, and posts Int16 PCM chunks (~128 ms) to the main thread.
class PCMCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.buf = [];
    this.bufLen = 0;
    this.CHUNK = 2048;
    this._t = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    const ratio = sampleRate / this.targetRate;
    const out = [];
    let t = this._t;
    while (t < ch.length - 1) {
      const i = Math.floor(t);
      const frac = t - i;
      out.push(ch[i] * (1 - frac) + ch[i + 1] * frac);
      t += ratio;
    }
    this._t = t - ch.length;
    if (out.length) { this.buf.push(out); this.bufLen += out.length; }
    while (this.bufLen >= this.CHUNK) {
      const flat = new Float32Array(this.bufLen);
      let o = 0;
      for (const b of this.buf) { flat.set(b, o); o += b.length; }
      const chunk = flat.subarray(0, this.CHUNK);
      const rest = flat.subarray(this.CHUNK);
      this.buf = rest.length ? [Array.from(rest)] : [];
      this.bufLen = rest.length;
      const pcm = new Int16Array(this.CHUNK);
      for (let i = 0; i < this.CHUNK; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor("pcm-capture", PCMCapture);
