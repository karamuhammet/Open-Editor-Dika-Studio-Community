/* ══════════════════════════════════════════════════════════════
   Multi-cam sync worker  -  video/ve-multicam-sync/ve-multicam-sync.worker.js

   Synchronize-by-Audio: given each angle's mono PCM, return the offset of every angle
   on a shared time axis, plus an honest confidence for each.

   This REPLACES the old VEA._crossCorrelate (ve-advanced-features/multicam), which was
   audited and found to be a toy: a raw mean product with no normalisation (so it aligned
   the loudest passage, not the true offset), naive stride decimation with no anti-alias,
   a lag-dependent divisor that made large lags win on noise, and a +/-2 SECOND search
   window on a feature whose whole purpose is cameras started minutes apart.

   The design here, and what each part fixes:
     1. RMS envelope @100Hz instead of raw-sample correlation. 29M samples -> ~60k, and
        the RMS window IS a lowpass, so the aliasing disappears by construction rather
        than being patched. Also robust to two different mics in one room, which
        raw-sample correlation is not.
     2. Per-envelope DC removal + std normalisation => true NCC => gain-invariant.
     3. Energy-normalised score per lag (divide by sqrt(refEnergy*testEnergy) INSIDE the
        overlap) + a minimum-overlap floor => a short overlap can no longer win on noise.
     4. Coarse search over the FULL overlap (no window), then fine, then raw-sample.
     5. Reference = highest-RMS angle, not index 0.
     6. Confidence = best / second-best-outside-a-guard-band. A sync tool that cannot say
        "I am not sure" is the dishonest kind.

   Protocol
     in : { type:'sync', id, refHint?, angles:[{srcId, pcm:Float32Array, sampleRate}] }
          pcm buffers are transferred
     out: { type:'progress', id, phase, pct }
          { type:'result', id, refSrcId, angles:[{srcId, offset, confidence, status}] }
          { type:'error', id?, message }

   status: 'ok' | 'low-confidence' | 'unsynced' (silent/flat) | 'reference'

   Plan: docs/multicam-rebuild-plan-v2.md  (section 6)
   ══════════════════════════════════════════════════════════════ */
'use strict';

var ENV_HZ = 100;        // envelope frame rate: 10ms resolution
var COARSE_HZ = 10;      // coarse pass: 100ms resolution over the whole overlap
var FINE_RADIUS_S = 1.0; // fine pass half-window around the coarse peak
var REFINE_RADIUS_S = 0.015;
var REFINE_SLICE_S = 2.0;  // raw-sample refinement uses a slice, not the whole file
var MIN_OVERLAP_FRAC = 0.2;
var CONF_GUARD_FRAMES = 5; // ignore the winner's own neighbours when looking for a rival
// Two independent gates. Both are needed, and MIN_SCORE is the one that actually earns its
// keep: an UNRELATED pair produces a low peak AND a low rival, so the RATIO alone reads as
// confident (measured: ratio 1.30, i.e. it slips straight past LOW_CONF) while the match is
// meaningless. Absolute peak quality is what separates them.
// Measured on the §6 test rig: true matches score 0.99-1.00, an unrelated pair scores 0.32.
// 0.35 sits in that gap, nearer the failures, so a marginal real match is flagged rather
// than silently trusted.
var LOW_CONF = 1.3;
var MIN_SCORE = 0.35;

/* ── RMS energy envelope. The window is 2 hops, so frames overlap 50%. ── */
function envelope(pcm, sampleRate, hz) {
  var hop = Math.max(1, Math.round(sampleRate / hz));
  var win = hop * 2;
  var n = Math.floor(pcm.length / hop);
  var env = new Float32Array(n > 0 ? n : 0);
  for (var i = 0; i < n; i++) {
    var s = i * hop;
    var e = Math.min(pcm.length, s + win);
    var sum = 0;
    for (var j = s; j < e; j++) sum += pcm[j] * pcm[j];
    env[i] = Math.sqrt(sum / Math.max(1, e - s));
  }
  return env;
}

function rms(a) {
  if (!a || !a.length) return 0;
  var s = 0;
  for (var i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / a.length);
}

/* ── DC removal + std normalisation. Returns null for a flat/silent signal, which the
      caller reports as 'unsynced' rather than inventing an offset for it. ── */
function normalize(env) {
  var n = env.length;
  if (!n) return null;
  var mean = 0, i;
  for (i = 0; i < n; i++) mean += env[i];
  mean /= n;
  var vs = 0;
  for (i = 0; i < n; i++) { var d = env[i] - mean; vs += d * d; }
  var std = Math.sqrt(vs / n);
  if (!(std > 1e-9)) return null;
  var out = new Float32Array(n);
  for (i = 0; i < n; i++) out[i] = (env[i] - mean) / std;
  return out;
}

/* ── Mean decimation. The mean IS the anti-alias lowpass; this is the difference from
      the old code's naive stride pick. ── */
function decimate(env, factor) {
  if (factor <= 1) return env;
  var n = Math.floor(env.length / factor);
  var out = new Float32Array(n > 0 ? n : 0);
  for (var i = 0; i < n; i++) {
    var s = 0;
    for (var j = 0; j < factor; j++) s += env[i * factor + j];
    out[i] = s / factor;
  }
  return out;
}

/* ── Energy-normalised cross-correlation over a lag range.
      score(lag) = sum(ref*test) / sqrt(sum(ref^2)*sum(test^2)), all inside the overlap.
      Dividing by the overlap's own energy (not by a raw count) is what stops a tiny
      overlap from scoring high on noise. ── */
function nccRange(ref, test, loLag, hiLag, minOverlap) {
  var best = -Infinity, bestLag = 0;
  var scores = [], lagOf = [];
  for (var lag = loLag; lag <= hiLag; lag++) {
    var s = Math.max(0, lag);
    var e = Math.min(ref.length, lag + test.length);
    var ov = e - s;
    if (ov < minOverlap) continue;
    var dot = 0, re = 0, te = 0;
    for (var i = s; i < e; i++) {
      var a = ref[i], b = test[i - lag];
      dot += a * b; re += a * a; te += b * b;
    }
    var den = Math.sqrt(re * te);
    var sc = den > 1e-9 ? dot / den : 0;
    scores.push(sc); lagOf.push(lag);
    if (sc > best) { best = sc; bestLag = lag; }
  }
  if (!scores.length) return null;

  // Rival = highest score outside a guard band around the winner, so the winner's own
  // shoulders don't masquerade as competition.
  var second = -Infinity;
  for (var k = 0; k < scores.length; k++) {
    if (Math.abs(lagOf[k] - bestLag) <= CONF_GUARD_FRAMES) continue;
    if (scores[k] > second) second = scores[k];
  }
  return { lag: bestLag, score: best, second: second };
}

/* ── Raw-sample refinement in a narrow window, on a slice taken from the middle of the
      overlap (the whole file would be pointless work at this resolution). ── */
function refineSamples(refPcm, testPcm, rate, coarseSec) {
  var centerLag = Math.round(coarseSec * rate);
  var radius = Math.round(REFINE_RADIUS_S * rate);
  var slice = Math.round(REFINE_SLICE_S * rate);

  var ovStart = Math.max(0, centerLag);
  var ovEnd = Math.min(refPcm.length, centerLag + testPcm.length);
  if (ovEnd - ovStart < slice + 2 * radius) return null;

  var mid = Math.floor((ovStart + ovEnd) / 2 - slice / 2);
  var best = -Infinity, bestLag = centerLag;
  for (var lag = centerLag - radius; lag <= centerLag + radius; lag++) {
    var dot = 0, re = 0, te = 0;
    for (var i = 0; i < slice; i++) {
      var ri = mid + i;
      var ti = ri - lag;
      if (ri < 0 || ri >= refPcm.length || ti < 0 || ti >= testPcm.length) continue;
      var a = refPcm[ri], b = testPcm[ti];
      dot += a * b; re += a * a; te += b * b;
    }
    var den = Math.sqrt(re * te);
    var sc = den > 1e-9 ? dot / den : 0;
    if (sc > best) { best = sc; bestLag = lag; }
  }
  return bestLag / rate;
}

function post(id, phase, pct) {
  self.postMessage({ type: 'progress', id: id, phase: phase, pct: pct });
}

function runSync(msg) {
  var id = msg.id;
  var angles = msg.angles || [];
  if (angles.length < 2) throw new Error('Sync needs at least 2 angles');

  // 1. envelopes
  post(id, 'envelope', 5);
  var prep = angles.map(function (a) {
    var env = envelope(a.pcm, a.sampleRate, ENV_HZ);
    return {
      srcId: a.srcId, pcm: a.pcm, rate: a.sampleRate,
      env: env, envRms: rms(env), norm: normalize(env)
    };
  });

  // 2. reference = highest-RMS angle that actually has signal (NOT index 0)
  var ref = null;
  for (var i = 0; i < prep.length; i++) {
    if (!prep[i].norm) continue;
    if (!ref || prep[i].envRms > ref.envRms) ref = prep[i];
  }
  if (!ref) throw new Error('Every angle is silent; nothing to sync against');

  var results = [];
  var minOvCoarse = Math.max(1, Math.floor(Math.min.apply(null, prep.map(function (p) {
    return p.norm ? Math.floor(p.norm.length / (ENV_HZ / COARSE_HZ)) : 1;
  })) * MIN_OVERLAP_FRAC));

  var refCoarse = decimate(ref.norm, ENV_HZ / COARSE_HZ);

  for (var k = 0; k < prep.length; k++) {
    var p = prep[k];
    if (p.srcId === ref.srcId) {
      results.push({ srcId: p.srcId, offset: 0, confidence: 1, status: 'reference' });
      continue;
    }
    if (!p.norm) {
      // Silent angle: say so. Do not fabricate an offset.
      results.push({ srcId: p.srcId, offset: 0, confidence: 0, status: 'unsynced' });
      continue;
    }
    post(id, 'correlate', 10 + Math.round((k / prep.length) * 80));

    // 3. coarse over the FULL overlap
    var testCoarse = decimate(p.norm, ENV_HZ / COARSE_HZ);
    var coarse = nccRange(refCoarse, testCoarse,
      -(testCoarse.length - 1), refCoarse.length - 1, minOvCoarse);
    if (!coarse) { results.push({ srcId: p.srcId, offset: 0, confidence: 0, status: 'unsynced' }); continue; }
    var coarseSec = coarse.lag / COARSE_HZ;

    // 4. fine, around the coarse peak
    var centerFine = Math.round(coarseSec * ENV_HZ);
    var rFine = Math.round(FINE_RADIUS_S * ENV_HZ);
    var minOvFine = Math.max(1, Math.floor(Math.min(ref.norm.length, p.norm.length) * MIN_OVERLAP_FRAC));
    var fine = nccRange(ref.norm, p.norm, centerFine - rFine, centerFine + rFine, minOvFine);
    var offset = fine ? fine.lag / ENV_HZ : coarseSec;
    var score = fine ? fine.score : coarse.score;
    var rival = fine && fine.second > -Infinity ? fine.second : coarse.second;

    // 5. raw-sample refinement
    var refined = refineSamples(ref.pcm, p.pcm, p.rate, offset);
    if (refined !== null && isFinite(refined)) offset = refined;

    // 6. honest confidence — TWO criteria, because the ratio alone is not enough:
    //    two unrelated recordings produce a low peak AND a low rival, so their ratio can
    //    look respectable while the match is meaningless. The absolute peak quality is what
    //    separates "found it" from "found nothing in particular".
    var conf = (rival > 0.001) ? (score / rival) : (score > MIN_SCORE ? 3 : 1);
    var weak = (conf < LOW_CONF) || (score < MIN_SCORE);
    results.push({
      srcId: p.srcId,
      offset: offset,
      confidence: conf,
      score: score,
      status: weak ? 'low-confidence' : 'ok'
    });
  }

  post(id, 'done', 100);
  self.postMessage({ type: 'result', id: id, refSrcId: ref.srcId, angles: results });
}

self.onmessage = function (e) {
  var msg = e.data || {};
  if (msg.type !== 'sync') return;
  try {
    runSync(msg);
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: (err && err.message) || String(err) });
  }
};
