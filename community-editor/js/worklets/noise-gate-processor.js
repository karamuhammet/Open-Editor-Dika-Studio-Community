// ═══════════════════════════════════════════════════════════════════
//  Noise Gate AudioWorklet Processor
//  Sample-accurate gating with attack/hold/release envelope
//  dika studio Video Editor — MirexSoft
// ═══════════════════════════════════════════════════════════════════

class NoiseGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -40, minValue: -80, maxValue: 0, automationRate: 'k-rate' },
      { name: 'attack',    defaultValue: 0.001, minValue: 0.0001, maxValue: 0.05, automationRate: 'k-rate' },
      { name: 'hold',      defaultValue: 0.05,  minValue: 0.001,  maxValue: 0.5,  automationRate: 'k-rate' },
      { name: 'release',   defaultValue: 0.05,  minValue: 0.005,  maxValue: 0.2,  automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this._envelope = 0;     // current gate envelope (0 = closed, 1 = open)
    this._holdSamples = 0;  // remaining hold samples
    this._isOpen = false;
    this._rmsWindow = new Float32Array(512);
    this._rmsIdx = 0;
    this._rmsSum = 0;
  }

  process(inputs, outputs, parameters) {
    var input = inputs[0];
    var output = outputs[0];
    if (!input || input.length === 0) return true;

    var threshold = parameters.threshold[0];
    var attack = parameters.attack[0];
    var hold = parameters.hold[0];
    var release = parameters.release[0];
    var sr = sampleRate;

    var attackCoeff = Math.exp(-1 / (attack * sr));
    var releaseCoeff = Math.exp(-1 / (release * sr));
    var holdSamplesMax = Math.round(hold * sr);
    var thresholdLinear = Math.pow(10, threshold / 20);

    var numChannels = Math.min(input.length, output.length);
    var blockSize = input[0].length;

    for (var i = 0; i < blockSize; i++) {
      // Compute RMS across all channels
      var sumSq = 0;
      for (var ch = 0; ch < numChannels; ch++) {
        var s = input[ch][i];
        sumSq += s * s;
      }
      var rms = Math.sqrt(sumSq / numChannels);

      // Running RMS for smoother detection
      this._rmsSum -= this._rmsWindow[this._rmsIdx];
      this._rmsWindow[this._rmsIdx] = rms;
      this._rmsSum += rms;
      this._rmsIdx = (this._rmsIdx + 1) % this._rmsWindow.length;
      var avgRms = this._rmsSum / this._rmsWindow.length;

      // Gate logic
      if (avgRms >= thresholdLinear) {
        this._isOpen = true;
        this._holdSamples = holdSamplesMax;
        // Attack: ramp up
        this._envelope = 1 - attackCoeff * (1 - this._envelope);
      } else if (this._holdSamples > 0) {
        this._holdSamples--;
        this._envelope = 1 - attackCoeff * (1 - this._envelope);
      } else {
        this._isOpen = false;
        // Release: ramp down
        this._envelope = releaseCoeff * this._envelope;
      }

      // Apply envelope
      for (var ch2 = 0; ch2 < numChannels; ch2++) {
        output[ch2][i] = input[ch2][i] * this._envelope;
      }
    }

    return true;
  }
}

registerProcessor('noise-gate-processor', NoiseGateProcessor);
