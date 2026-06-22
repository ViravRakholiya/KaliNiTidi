// Tiny WebAudio sound effects (ported from the original client).
import { store } from "./store.js";

let actx = null;
function beep(freq, dur, type, vol) {
  if (store.get().muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(),
      g = actx.createGain();
    o.type = type || "sine";
    o.frequency.value = freq;
    g.gain.value = vol || 0.05;
    o.connect(g);
    g.connect(actx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (dur || 0.12));
    o.stop(actx.currentTime + (dur || 0.12));
  } catch (e) {}
}

export const SFX = {
  play: () => beep(420, 0.09, "triangle", 0.06),
  deal: () => beep(300, 0.06, "sine", 0.04),
  win: () => {
    beep(523, 0.1, "sine", 0.06);
    setTimeout(() => beep(784, 0.14, "sine", 0.06), 90);
  },
  turn: () => beep(660, 0.12, "sine", 0.05),
  bid: () => beep(500, 0.08, "square", 0.04),
};
