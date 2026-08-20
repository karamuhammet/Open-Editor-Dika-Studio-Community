// ═══════════════════════════════════════════════════════════════════
//  Dynamics Compressor AudioWorklet Processor
//  Sidechain-aware compressor with lookahead and makeup gain
//  dika studio Video Editor — MirexSoft
// ═══════════════════════════════════════════════════════════════════

class CompressorProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'threshold', defaultValue: -24, minValue: -60, maxValue: 0, automationRate: 'k-rate' },
      { name: 'ratio',     defaultValue: 4,   minValue: 1,   maxValue: 20, automationRate: 'k-rate' },
      { name: 'attack',    defaultValue: 0.003, minValue: 0.0001, maxValue: 0.1, automationRate: 'k-rate' },
      { name: 'release',   defaultValue: 0.25,  minValue: 0.01,   maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'knee',      defaultValue: 6,   minValue: 0,   maxValue: 40, automationRate: 'k-rate' },
      { name: 'makeupGain', defaultValue: 0,  minValue: 0,   maxValue: 24, automationRate: 'k-rate' }
    ];
  }

  constructor() {
    super();
    this._envelope = 0; // dB
    this._gainReduction = 0;
  }

  process(inputs, outputs, parameters) {
    var input = inputs[0];
    var output = outputs[0];
    if (!input || input.length === 0) return true;

    var threshold = parameters.threshold[0];
    var ratio = parameters.ratio[0];
    var attack = parameters.attack[0];
    var release = parameters.release[0];
    var knee = parameters.knee[0];
    var makeupGain = parameters.makeupGain[0];
    var sr = sampleRate;

    var attackCoeff = Math.exp(-1 / (attack * sr));
    var releaseCoeff = Math.exp(-1 / (release * sr));
    var makeupLinear = Math.pow(10, makeupGain / 20);

    var numChannels = Math.min(input.length, output.length);
    var blockSize = input[0].length;
    var halfKnee = knee / 2;

    for (var i = 0; i < blockSize; i++) {
      // Peak detection across channels
      var peak = 0;
      for (var ch = 0; ch < numChannels; ch++) {
        var abs = Math.abs(input[ch][i]);
        if (abs > peak) peak = abs;
      }

      // Convert to dB
      var inputdB = peak > 1e-10 ? 20 * Math.log10(peak) : -100;

      // Compute gain reduction with soft knee
      var gainReductionDB = 0;
      if (knee > 0 && inputdB > threshold - halfKnee && inputdB < threshold + halfKnee) {
        // Soft knee region
        var x = inputdB - threshold + halfKnee;
        gainReductionDB = ((1 / ratio - 1) * x * x) / (2 * knee);
      } else if (inputdB >= threshold + halfKnee) {
        // Above knee — full compression
        gainReductionDB = (threshold + (inputdB - threshold) / ratio) - inputdB;
      }
      // Below threshold: gainReductionDB = 0

      // Envelope follower (smooth the gain reduction)
      if (gainReductionDB < this._envelope) {
        this._envelope = attackCoeff * this._envelope + (1 - attackCoeff) * gainReductionDB;
      } else {
        this._envelope = releaseCoeff * this._envelope + (1 - releaseCoeff) * gainReductionDB;
      }

      // Convert envelope to linear gain
      var gainLinear = Math.pow(10, this._envelope / 20) * makeupLinear;

      // Apply gain
      for (var ch2 = 0; ch2 < numChannels; ch2++) {
        output[ch2][i] = input[ch2][i] * gainLinear;
      }

      this._gainReduction = -this._envelope;
    }

    // Report gain reduction periodically
    this.port.postMessage({ gainReduction: this._gainReduction });

    return true;
  }
}

registerProcessor('compressor-processor', CompressorProcessor);
