// Repro/verify: muting a video track must silence EVERY clip on it.
// Owner report: "2 video attım, o track'in sesini soldan kestim, 2. videonun sesi var."
//
// The engine decides a clip's track ONCE, at connect time, and the lazy connect inside syncPlayback
// re-raised the track gain to track.volume. So a clip that moved tracks kept feeding its OLD track's
// gain, and a clip that joined the graph after the mute un-muted the whole track.
//
// No media and no audio hardware: window.AudioContext is replaced with a recording fake BEFORE the
// module loads (the engine builds its context lazily), so the assertions read the real graph edges.
/* Resolved from THIS file, never an absolute path on one machine: the repository is public and the
   old literal only existed on the machine it was written on. */
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const require_ = createRequire(import.meta.url);
/* playwright is NOT a dependency of this repository: the editor has no bundler and no test runner,
   and the shared install has gone missing mid-session before now. A missing package has to say so in
   one sentence - the absolute import this replaced failed with a module-resolver stack trace, which
   reads like a broken test rather than an absent tool. */
let pw;
try {
  pw = require_("playwright");
} catch {
  console.log("skipped: playwright is not installed here.");
  console.log("Install it (npm i -D playwright) or run this from a workspace that has it.");
  console.log("The assertions themselves need no network and no audio hardware.");
  process.exit(0);
}
const { chromium } = pw;

// VE_ENGINE lets the same assertions run against a pre-fix copy of the module, which is the only
// thing that proves they would have caught the reported bug.
/* THIS build's engine, not the commercial one. It used to default into apps/editor, one directory
   up and outside this repository: the test passed while asserting nothing about the file that
   actually ships here, and would have stayed green through any regression in it. */
const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = process.env.VE_ENGINE ||
  join(HERE, "..", "modules", "video", "ve-audio-engine", "ve-audio-engine.js");

const browser = await chromium.launch({ headless: true });
const page = await browser.newContext().then((c) => c.newPage());
const errors = [];
page.on("pageerror", (e) => errors.push(e.message.slice(0, 160)));

await page.addInitScript(() => {
  var seq = 0;
  function node(type) {
    return { __t: type, __id: type + "#" + seq++, __out: [],
      connect: function (t) { if (this.__out.indexOf(t) < 0) this.__out.push(t); return t; },
      disconnect: function (t) { this.__out = t ? this.__out.filter(function (x) { return x !== t; }) : []; } };
  }
  function param(v) { return { value: v }; }
  function FakeAC() {
    this.state = "running";
    this.destination = node("destination");
    this.__nodes = [];
  }
  FakeAC.prototype._reg = function (n) { this.__nodes.push(n); return n; };
  FakeAC.prototype.createGain = function () { var n = node("gain"); n.gain = param(1); return this._reg(n); };
  FakeAC.prototype.createStereoPanner = function () { var n = node("panner"); n.pan = param(0); return this._reg(n); };
  FakeAC.prototype.createAnalyser = function () {
    var n = node("analyser"); n.fftSize = 256; n.smoothingTimeConstant = 0.8; n.frequencyBinCount = 128;
    n.getByteFrequencyData = function () {}; n.getByteTimeDomainData = function () {};
    return this._reg(n);
  };
  FakeAC.prototype.createBiquadFilter = function () {
    var n = node("biquad"); n.type = "peaking"; n.frequency = param(0); n.Q = param(1); n.gain = param(0);
    return this._reg(n);
  };
  FakeAC.prototype.createMediaElementSource = function (el) {
    if (el.__srcMade) throw Object.assign(new Error("already"), { name: "InvalidStateError" });
    el.__srcMade = true;
    var n = node("source"); n.__el = el; return this._reg(n);
  };
  FakeAC.prototype.resume = function () { return Promise.resolve(); };
  FakeAC.prototype.close = function () { this.state = "closed"; return Promise.resolve(); };
  window.AudioContext = FakeAC;
  window.webkitAudioContext = FakeAC;

  // Walk source -> ... -> clipGain -> trackGain. The track gain is the first gain whose output
  // reaches a panner (that is exactly how _ensureTrackGain wires a track).
  window.__trackGainOf = function (el) {
    var ctx = window.__ac;
    if (!ctx) return null;
    var src = null;
    for (var i = 0; i < ctx.__nodes.length; i++) if (ctx.__nodes[i].__el === el) src = ctx.__nodes[i];
    if (!src) return null;
    var seen = {}, queue = [src];
    while (queue.length) {
      var n = queue.shift();
      if (seen[n.__id]) continue;
      seen[n.__id] = true;
      for (var k = 0; k < n.__out.length; k++) {
        var o = n.__out[k];
        if (o.__t === "gain" && o.__out.some(function (x) { return x.__t === "panner"; })) return o;
        queue.push(o);
      }
    }
    return null;
  };
});

await page.goto("about:blank");
await page.addScriptTag({ path: ENGINE });
// Capture the context the engine creates (it is lazy, so this hook is in place first).
await page.evaluate(() => {
  const real = window.AudioContext;
  window.AudioContext = function () { const c = new real(); window.__ac = c; return c; };
  window.webkitAudioContext = window.AudioContext;
});

const out = await page.evaluate(() => {
  const E = window.VEAudioEngine;
  const mk = (id) => { const v = document.createElement("video"); v.id = id; document.body.appendChild(v); return v; };
  const R = {};

  // ── Case 1: two clips on ONE track, track muted (the plain report) ────────────
  const a = mk("a"), b = mk("b");
  E.ensureContext();
  E.connectClip("cA", a, "t1", 1);
  E.connectClip("cB", b, "t1", 1);
  E.applySolo([{ id: "t1", muted: true, clips: [{ id: "cA" }, { id: "cB" }] }]);
  R.case1 = { a: window.__trackGainOf(a).gain.value, b: window.__trackGainOf(b).gain.value };

  // ── Case 2: clip born on t2, dragged onto t1, then t1 muted ───────────────────
  const c = mk("c");
  E.connectClip("cC", c, "t2", 1);                       // connected while it sat on t2
  E.applySolo([                                          // project now says cC lives on t1
    { id: "t1", muted: true, clips: [{ id: "cA" }, { id: "cB" }, { id: "cC" }] },
    { id: "t2", volume: 0.42, clips: [] }
  ]);
  const g2 = window.__trackGainOf(c);
  R.case2 = { gain: g2.gain.value, stillOnOldTrack: g2.gain.value === 0.42 };

  // ── Case 3: clip joins the graph DURING playback on an already muted track ────
  const d = mk("d");
  window.VideoEditor = { _vePlayback: { videoPool: { cD: d } } };
  const tracks = [{ id: "t1", muted: true, clips: [
    { id: "cA", type: "video", startTime: 0, duration: 5 },
    { id: "cD", type: "video", startTime: 5, duration: 5 }
  ] }];
  E.applySolo(tracks);
  E.syncPlayback(tracks, 6, true);                       // playhead inside cD -> lazy connect
  R.case3 = { trackGain: window.__trackGainOf(d) ? window.__trackGainOf(d).gain.value : null,
              connected: E.hasClip("cD") };

  // ── Case 4: the element was rebuilt -> a new source must be made ──────────────
  const e2 = mk("e2");
  E.connectClip("cA", e2, "t1", 1);                      // same clip id, different element
  R.case4 = { rebuiltRouted: !!window.__trackGainOf(e2), oldStillRouted: !!window.__trackGainOf(a) };

  return R;
});

const pass = {
  "case1 both clips silenced by track mute": out.case1.a === 0 && out.case1.b === 0,
  "case2 moved clip follows its NEW track (muted)": out.case2.gain === 0 && !out.case2.stillOnOldTrack,
  "case3 lazy connect does NOT revive a muted track": out.case3.connected === true && out.case3.trackGain === 0,
  "case4 rebuilt element gets a fresh source": out.case4.rebuiltRouted === true && out.case4.oldStillRouted === false
};
console.log(JSON.stringify({ out, pass, pageErrors: errors.slice(0, 4) }, null, 2));
console.log(Object.values(pass).every(Boolean) ? "ALL PASS" : "FAIL");
await browser.close();
