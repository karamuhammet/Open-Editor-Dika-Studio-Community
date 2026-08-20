/* Module: video/ve-performance/webgpu — Katman 5 — WebGPU pipeline + benchmark.
   Part of the ve-performance group (decomposed from the 1654-line IIFE). Functions hang off the
   shared namespace VEP (window.__ccVEPerformance, created by the parent); cross-module refs resolve
   through VEP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEP = window.__ccVEPerformance;
  if (!VEP) return;

  VEP.WebGPUPipeline = {
    _device: null,
    _available: false,

    /**
     * Detect and initialize WebGPU if available
     */
    init: function() {
      var self = this;
      if (!navigator.gpu) {
        self._available = false;
        return Promise.resolve(false);
      }

      return navigator.gpu.requestAdapter().then(function(adapter) {
        if (!adapter) { self._available = false; return false; }
        return adapter.requestDevice().then(function(device) {
          self._device = device;
          self._available = true;
          console.log('[VEPerformance] WebGPU initialized');
          return true;
        });
      }).catch(function() {
        self._available = false;
        return false;
      });
    },

    isAvailable: function() {
      return this._available;
    },

    getDevice: function() {
      return this._device;
    },

    /**
     * Run a compute shader on pixel data
     * @param {string} shaderCode — WGSL compute shader
     * @param {Uint8ClampedArray} pixelData — input pixels
     * @param {number} width, height
     * @returns {Promise<Uint8ClampedArray>} processed pixels
     */
    runComputeShader: function(shaderCode, pixelData, width, height) {
      if (!this._available || !this._device) {
        return Promise.reject(new Error('WebGPU not available'));
      }

      var device = this._device;

      // Create shader module
      var shaderModule = device.createShaderModule({ code: shaderCode });

      // Create input/output buffers
      var bufferSize = width * height * 4;
      var inputBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
      });
      new Uint8Array(inputBuffer.getMappedRange()).set(pixelData);
      inputBuffer.unmap();

      var outputBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
      });

      var readBuffer = device.createBuffer({
        size: bufferSize,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
      });

      // Create bind group layout + pipeline
      var bindGroupLayout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
          { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
        ]
      });

      var pipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
        compute: { module: shaderModule, entryPoint: 'main' }
      });

      var bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: inputBuffer } },
          { binding: 1, resource: { buffer: outputBuffer } }
        ]
      });

      // Dispatch
      var commandEncoder = device.createCommandEncoder();
      var passEncoder = commandEncoder.beginComputePass();
      passEncoder.setPipeline(pipeline);
      passEncoder.setBindGroup(0, bindGroup);
      passEncoder.dispatchWorkgroups(Math.ceil(width / 16), Math.ceil(height / 16));
      passEncoder.end();

      commandEncoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, bufferSize);
      device.queue.submit([commandEncoder.finish()]);

      return readBuffer.mapAsync(GPUMapMode.READ).then(function() {
        var result = new Uint8ClampedArray(readBuffer.getMappedRange().slice(0));
        readBuffer.unmap();
        inputBuffer.destroy();
        outputBuffer.destroy();
        readBuffer.destroy();
        return result;
      });
    },

    /**
     * Pre-built WGSL chroma key compute shader
     */
    CHROMA_KEY_WGSL:
      '@group(0) @binding(0) var<storage, read> input: array<u32>;\n' +
      '@group(0) @binding(1) var<storage, read_write> output: array<u32>;\n' +
      '\n' +
      '@compute @workgroup_size(16, 16)\n' +
      'fn main(@builtin(global_invocation_id) id: vec3<u32>) {\n' +
      '  let idx = id.x + id.y * 1920u;\n' +
      '  let pixel = input[idx];\n' +
      '  let r = f32(pixel & 0xFFu) / 255.0;\n' +
      '  let g = f32((pixel >> 8u) & 0xFFu) / 255.0;\n' +
      '  let b = f32((pixel >> 16u) & 0xFFu) / 255.0;\n' +
      '  // YCbCr chroma distance\n' +
      '  let pCb = -0.168736*r - 0.331264*g + 0.5*b;\n' +
      '  let pCr = 0.5*r - 0.418688*g - 0.081312*b;\n' +
      '  let dist = length(vec2<f32>(pCb - 0.0, pCr - (-0.334)));\n' +
      '  var alpha = smoothstep(0.3, 0.4, dist);\n' +
      '  output[idx] = (u32(alpha * 255.0) << 24u) | (pixel & 0x00FFFFFFu);\n' +
      '}\n',

    destroy: function() {
      if (this._device) {
        this._device.destroy();
        this._device = null;
      }
      this._available = false;
    }
  };

  VEP.Benchmark = {
    /**
     * Run a benchmark function N times and return average ms
     */
    measure: function(name, fn, iterations) {
      var iters = iterations || 10;
      var times = [];
      for (var i = 0; i < iters; i++) {
        var t0 = performance.now();
        fn();
        var t1 = performance.now();
        times.push(t1 - t0);
      }
      times.sort(function(a, b) { return a - b; });
      var median = times[Math.floor(times.length / 2)];
      var avg = 0;
      for (var j = 0; j < times.length; j++) avg += times[j];
      avg = avg / times.length;
      return { name: name, median: median.toFixed(2), avg: avg.toFixed(2), min: times[0].toFixed(2), max: times[times.length - 1].toFixed(2) };
    },

    /**
     * Run all benchmarks
     */
    runAll: function(width, height) {
      var w = width || 1920;
      var h = height || 1080;
      var results = [];

      // Create test canvas
      var testCanvas = document.createElement('canvas');
      testCanvas.width = w;
      testCanvas.height = h;
      var ctx = testCanvas.getContext('2d');
      ctx.fillStyle = '#00FF00'; // green for chroma key testing
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(w/4, h/4, w/2, h/2);

      // B1: Raw getImageData
      results.push(this.measure('getImageData', function() {
        ctx.getImageData(0, 0, w, h);
      }));

      // B2: SinglePass chroma+grade (CPU)
      results.push(this.measure('SinglePass CPU', function() {
        VEP.SinglePassProcessor.process(testCanvas, 0, 0, w, h,
          { enabled: true, keyColor: { r: 0, g: 255, b: 0 }, tolerance: 40, smoothness: 10, spillSuppression: 50 },
          { enabled: true, curves: { rgb: [{x:0,y:0},{x:0.5,y:0.6},{x:1,y:1}] } }
        );
      }));

      // B3: WebGL chroma+grade (GPU)
      if (VEP.WebGLPipeline.isAvailable()) {
        results.push(this.measure('WebGL GPU', function() {
          VEP.WebGLPipeline.processFrame(testCanvas, w, h,
            { enabled: true, keyColor: { r: 0, g: 255, b: 0 }, tolerance: 40, smoothness: 10, spillSuppression: 50 },
            { enabled: true, curves: { rgb: [{x:0,y:0},{x:0.5,y:0.6},{x:1,y:1}] } }
          );
        }));
      }

      return results;
    }
  };

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'webgpu', parent: 'video.ve-performance', title: 've-performance: webgpu', mount: function () {}, unmount: function () {} });
  }
})();
