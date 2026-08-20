// ═══════════════════════════════════════════════════════════════════
//  RNNoise AudioWorklet Processor
//  Noise reduction using RNNoise WASM in AudioWorklet thread
//  Falls back to simple spectral gate when WASM unavailable
//  dika studio Video Editor — MirexSoft
// ═══════════════════════════════════════════════════════════════════

class RNNoiseProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'mix', defaultValue: 1.0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'enabled', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' }
    ];
  }

  constructor(options) {
    super();
    this._wasmReady = false;
    this._wasmModule = null;
    this._denoiseState = null;
    this._frameSize = 480; // RNNoise operates on 480-sample frames (10ms at 48kHz)
    this._inputBuffer = new Float32Array(this._frameSize);
    this._outputBuffer = new Float32Array(this._frameSize);
    this._bufferIndex = 0;
    this._vadProb = 0;

    // Listen for WASM module from main thread
    this.port.onmessage = (e) => {
      if (e.data.type === 'wasm-module' && e.data.module) {
        this._initWasm(e.data.module);
      }
    };
    // Request WASM module
    this.port.postMessage({ type: 'request-wasm' });
  }

  _initWasm(wasmBytes) {
    try {
      // Instantiate WASM module
      WebAssembly.instantiate(wasmBytes).then((result) => {
        this._wasmModule = result.instance.exports;
        if (this._wasmModule.rnnoise_create) {
          this._denoiseState = this._wasmModule.rnnoise_create(null);
          this._wasmReady = true;
          this.port.postMessage({ type: 'ready' });
        }
      }).catch(() => {
        this.port.postMessage({ type: 'wasm-error', error: 'Failed to instantiate WASM' });
      });
    } catch (err) {
      this.port.postMessage({ type: 'wasm-error', error: err.message });
    }
  }

  process(inputs, outputs, parameters) {
    var input = inputs[0];
    var output = outputs[0];
    if (!input || input.length === 0) return true;

    var enabled = parameters.enabled[0] >= 0.5;
    var mix = parameters.mix[0];

    // If disabled, pass through
    if (!enabled) {
      for (var ch = 0; ch < output.length; ch++) {
        if (input[ch]) output[ch].set(input[ch]);
      }
      return true;
    }

    // Process mono (channel 0), copy to all output channels
    var inData = input[0];
    var outData = output[0];

    if (this._wasmReady && this._denoiseState) {
      // RNNoise WASM path — process in 480-sample frames
      for (var i = 0; i < inData.length; i++) {
        this._inputBuffer[this._bufferIndex] = inData[i] * 32768; // RNNoise expects int16 range
        this._bufferIndex++;

        if (this._bufferIndex >= this._frameSize) {
          // Process one frame through RNNoise
          var inPtr = this._wasmModule.malloc(this._frameSize * 4);
          var outPtr = this._wasmModule.malloc(this._frameSize * 4);
          var heap = new Float32Array(this._wasmModule.memory.buffer, inPtr, this._frameSize);
          heap.set(this._inputBuffer);

          this._vadProb = this._wasmModule.rnnoise_process_frame(this._denoiseState, outPtr, inPtr);

          var result = new Float32Array(this._wasmModule.memory.buffer, outPtr, this._frameSize);
          this._outputBuffer.set(result);

          this._wasmModule.free(inPtr);
          this._wasmModule.free(outPtr);
          this._bufferIndex = 0;
        }

        // Output: mix denoised with original
        var denoised = this._outputBuffer[Math.min(i, this._frameSize - 1)] / 32768;
        outData[i] = inData[i] * (1 - mix) + denoised * mix;
      }
    } else {
      // Fallback: simple soft-gate noise reduction
      // Uses a running RMS to gate low-level noise
      for (var j = 0; j < inData.length; j++) {
        var sample = inData[j];
        var abs = Math.abs(sample);

        // Simple gate: attenuate samples below threshold
        var threshold = 0.008; // ~-42 dB
        if (abs < threshold) {
          var attenuation = abs / threshold;
          sample *= attenuation * attenuation; // quadratic fade
        }
        outData[j] = inData[j] * (1 - mix) + sample * mix;
      }
    }

    // Copy mono to other channels
    for (var ch2 = 1; ch2 < output.length; ch2++) {
      output[ch2].set(outData);
    }

    // Report VAD probability
    this.port.postMessage({ type: 'vad', probability: this._vadProb });

    return true;
  }
}

registerProcessor('rnnoise-processor', RNNoiseProcessor);
