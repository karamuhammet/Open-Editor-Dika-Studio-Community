// ═══════════════════════════════════════════════════════════════════
//  LUFS Meter AudioWorklet Processor
//  EBU R128 / ITU-R BS.1770 loudness measurement
//  dika studio Video Editor — MirexSoft
// ═══════════════════════════════════════════════════════════════════

class LUFSProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // K-weighting pre-filter coefficients (48kHz)
    // Stage 1: High-shelf boost (+4dB at ~1500Hz)
    this._hs_b = [1.53512485958697, -2.69169618940638, 1.19839281085285];
    this._hs_a = [1.0, -1.69065929318241, 0.73248077421585];
    // Stage 2: High-pass (~38Hz)
    this._hp_b = [1.0, -2.0, 1.0];
    this._hp_a = [1.0, -1.99004745483398, 0.99007225036621];

    // Filter states per channel (up to 2 channels)
    this._states = [
      { hs: [0, 0, 0, 0], hp: [0, 0, 0, 0] },
      { hs: [0, 0, 0, 0], hp: [0, 0, 0, 0] }
    ];

    // Block accumulator: 400ms = 19200 samples at 48kHz
    this._blockSize = 19200;
    this._blockSum = [0, 0];
    this._blockCount = 0;
    this._blocks = []; // last 30 blocks for short-term
    this._maxBlocks = 30;

    this._momentary = -Infinity;
    this._shortTerm = -Infinity;
    this._reportInterval = 4; // report every 4 blocks (~1.6s)
    this._blocksSinceReport = 0;
  }

  _applyKWeight(sample, ch) {
    var st = this._states[ch];
    // High-shelf
    var x0 = sample;
    var y0 = this._hs_b[0] * x0 + st.hs[0];
    st.hs[0] = this._hs_b[1] * x0 - this._hs_a[1] * y0 + st.hs[1];
    st.hs[1] = this._hs_b[2] * x0 - this._hs_a[2] * y0;
    // High-pass
    var x1 = y0;
    var y1 = this._hp_b[0] * x1 + st.hp[0];
    st.hp[0] = this._hp_b[1] * x1 - this._hp_a[1] * y1 + st.hp[1];
    st.hp[1] = this._hp_b[2] * x1 - this._hp_a[2] * y1;
    return y1;
  }

  process(inputs, outputs, parameters) {
    var input = inputs[0];
    if (!input || input.length === 0) return true;

    var numChannels = Math.min(input.length, 2);
    var blockSize = input[0].length;

    // Pass-through
    for (var ch = 0; ch < numChannels; ch++) {
      if (outputs[0] && outputs[0][ch]) {
        outputs[0][ch].set(input[ch]);
      }
    }

    // K-weighted power accumulation
    for (var i = 0; i < blockSize; i++) {
      for (var c = 0; c < numChannels; c++) {
        var filtered = this._applyKWeight(input[c][i], c);
        this._blockSum[c] += filtered * filtered;
      }
      this._blockCount++;

      if (this._blockCount >= this._blockSize) {
        // Compute mean square per channel
        var totalPower = 0;
        for (var c2 = 0; c2 < numChannels; c2++) {
          totalPower += this._blockSum[c2] / this._blockCount;
          this._blockSum[c2] = 0;
        }
        this._blockCount = 0;

        this._blocks.push(totalPower / numChannels);
        if (this._blocks.length > this._maxBlocks) this._blocks.shift();

        // Momentary LUFS (last 4 blocks ≈ 400ms × 4)
        var momBlocks = this._blocks.slice(-4);
        this._momentary = this._calcLUFS(momBlocks);

        // Short-term LUFS (last 30 blocks ≈ 3s)
        this._shortTerm = this._calcLUFS(this._blocks);

        this._blocksSinceReport++;
        if (this._blocksSinceReport >= this._reportInterval) {
          this.port.postMessage({
            momentary: this._momentary,
            shortTerm: this._shortTerm,
            blockCount: this._blocks.length
          });
          this._blocksSinceReport = 0;
        }
      }
    }

    return true;
  }

  _calcLUFS(blocks) {
    if (!blocks.length) return -Infinity;
    var sum = 0;
    for (var i = 0; i < blocks.length; i++) sum += blocks[i];
    var meanPower = sum / blocks.length;
    if (meanPower <= 0) return -Infinity;
    return -0.691 + 10 * Math.log10(meanPower);
  }
}

registerProcessor('lufs-processor', LUFSProcessor);
