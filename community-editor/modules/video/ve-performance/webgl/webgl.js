/* Module: video/ve-performance/webgl — Katman 3 — WebGL pipeline + GLSL shader sources.
   Part of the ve-performance group (decomposed from the 1654-line IIFE). Functions hang off the
   shared namespace VEP (window.__ccVEPerformance, created by the parent); cross-module refs resolve
   through VEP at call time, so sibling load order does not matter. */
(function () {
  'use strict';
  var VEP = window.__ccVEPerformance;
  if (!VEP) return;

  VEP.WebGLPipeline = {
    _canvas: null,
    _gl: null,
    _programs: {},
    _textures: {},
    _fbos: [],
    _quadBuffer: null,
    _initialized: false,
    _version: 0, // 1 = WebGL1, 2 = WebGL2

    init: function() {
      if (this._initialized) return true;

      this._canvas = document.createElement('canvas');
      this._canvas.width = 1;
      this._canvas.height = 1;

      // Try WebGL 2 first, then WebGL 1
      var gl = this._canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
      if (gl) {
        this._version = 2;
      } else {
        gl = this._canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
        if (gl) this._version = 1;
      }

      if (!gl) {
        console.warn('[VEPerformance] WebGL not available');
        return false;
      }

      this._gl = gl;

      // Create fullscreen quad
      this._quadBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  0, 0,
         1, -1,  1, 0,
        -1,  1,  0, 1,
         1,  1,  1, 1
      ]), gl.STATIC_DRAW);

      // Compile shaders
      this._compileProgram('passthrough', VEP._VS_FULLSCREEN, VEP._FS_PASSTHROUGH);
      this._compileProgram('chromaKey', VEP._VS_FULLSCREEN, VEP._FS_CHROMA_KEY);
      this._compileProgram('colorGrade', VEP._VS_FULLSCREEN, VEP._FS_COLOR_GRADE);
      this._compileProgram('blur', VEP._VS_FULLSCREEN, VEP._FS_BLUR);
      this._compileProgram('sharpen', VEP._VS_FULLSCREEN, VEP._FS_SHARPEN);
      // WebGL2 only; on WebGL1 grading stays on the CPU (no sampler3D exists there).
      this._compile300('lut3d', VEP._VS_LUT3D, VEP._FS_LUT3D);
      this._compile300('lut3dwin', VEP._VS_LUT3D, VEP._FS_LUT3D_WINDOW);
      this._compile300('lut3dmatte', VEP._VS_LUT3D, VEP._FS_LUT3D_MATTE);

      // Create ping-pong FBOs
      this._createFBOs(1920, 1080);

      this._initialized = true;
      return true;
    },

    /* THIS FUNCTION COMPILED ZERO PROGRAMS UNTIL 2026-07-17, on every browser, both API versions.
       The shaders below are GLSL ES 1.00 (`attribute`, `varying`, `texture2D`, `gl_FragColor`), but:
         - on WebGL2 it prepended `#version 300 es`, and 300 es reserves `attribute`/`varying`, so
           every shader died with "Illegal use of reserved word";
         - on WebGL1 it prepended NOTHING (the ternary handed the precision line to version 2 only),
           so every fragment shader died with "No precision specified for (float)".
       Measured live: all five programs failed, and `processFrame` then returned a BLANK canvas that
       preview-render.js:790 happily drew over the clip while setting `_gpuHandledChroma = true`,
       which blocked the working CPU fallback. Net effect: **turning on chroma key erased the clip.**

       The fix: WebGL2 accepts GLSL ES 1.00 shaders. So never inject a #version, and always give the
       fragment shader its precision line. A 300 es program (the 3D LUT, `_compile300`) is compiled
       separately, because a program must be entirely one dialect or the other. */
    _compileProgram: function(name, vsSrc, fsSrc) {
      var gl = this._gl;
      if (!gl) return;

      // GLSL ES 1.00 on both API versions. The FS needs a precision qualifier; the VS does not.
      var prefix = 'precision highp float;\n';

      var vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, vsSrc);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.warn('[WebGL] VS compile error (' + name + '):', gl.getShaderInfoLog(vs));
        gl.deleteShader(vs);
        return;
      }

      var fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, prefix + fsSrc);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.warn('[WebGL] FS compile error (' + name + '):', gl.getShaderInfoLog(fs));
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return;
      }

      var prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn('[WebGL] Link error (' + name + '):', gl.getProgramInfoLog(prog));
        return;
      }

      this._programs[name] = prog;
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return prog;
    },

    /* A GLSL ES 3.00 program, for the one thing 1.00 cannot express: sampler3D.
       Programs are independent, so a 300 es program coexists with the 1.00 ones above; a single
       PROGRAM just cannot mix dialects. WebGL2 only, by definition. */
    _compile300: function(name, vsSrc, fsSrc) {
      var gl = this._gl;
      if (!gl || this._version !== 2) return null;
      var mk = function(type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          console.warn('[WebGL] 300es compile error (' + name + '):', gl.getShaderInfoLog(s));
          gl.deleteShader(s);
          return null;
        }
        return s;
      };
      var vs = mk(gl.VERTEX_SHADER, vsSrc);
      if (!vs) return null;
      var fs = mk(gl.FRAGMENT_SHADER, fsSrc);
      if (!fs) { gl.deleteShader(vs); return null; }
      var prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.warn('[WebGL] 300es link error (' + name + '):', gl.getProgramInfoLog(prog));
        return null;
      }
      this._programs[name] = prog;
      return prog;
    },

    /* Bake a whole grading config into one N^3 cube by running THE REAL CPU GRADER on each texel.
       This is the entire correctness argument: there is no second implementation of the grade, so
       GPU and CPU cannot disagree about anything except N^3 interpolation error (measured: max
       delta 1 of 255).

       Cost is ~23ms for N=33 (35,937 texels), ONCE PER CONFIG, replacing 105-334ms EVERY FRAME.
       Keyed by the config, which also dissolves the single-slot _lut3dCache thrash that made three
       graded clips rebuild a 17-cube every frame each. */
    LUT3D_SIZE: 33,

    _gradeKey: function(g) {
      if (!g) return '';
      try { return JSON.stringify(g); } catch (e) { return String(g.lutId) + '|' + String(g.lutIntensity); }
    },

    _bakeCube: function(grading) {
      var CG = window.VEColorGrading;
      if (!CG || !CG.processImageData) return null;
      var N = this.LUT3D_SIZE;
      var cube = new Uint8Array(N * N * N * 4);
      var px = new ImageData(1, 1);
      var q = 255 / (N - 1);
      for (var b = 0; b < N; b++) {
        for (var g = 0; g < N; g++) {
          for (var r = 0; r < N; r++) {
            px.data[0] = Math.round(r * q);
            px.data[1] = Math.round(g * q);
            px.data[2] = Math.round(b * q);
            px.data[3] = 255;
            CG.processImageData(px, grading);
            var i = ((b * N + g) * N + r) * 4;
            cube[i] = px.data[0]; cube[i + 1] = px.data[1]; cube[i + 2] = px.data[2]; cube[i + 3] = 255;
          }
        }
      }
      return cube;
    },

    /* A MAP of cube textures, keyed by grading config. NOT a single slot.
       The single-slot version is the exact bug this whole plan diagnosed in ve-color-grading.js:229,
       and I reimplemented it here by reflex: with three differently-graded clips the key changes on
       every call, so the cube is re-baked every clip every frame. Measured: 3 LUTs cost 57.45ms that
       way, against 0.02ms for one. A grade config is stable for seconds at a time; the cache has to
       hold all the LIVE ones, not just the last one.
       LRU-capped because each cube is a 33^3 RGBA texture (~143KB of VRAM). */
    // A clip's own grade plus every power window on it each need their own live cube, so this
    // ceiling is "how many distinct grades can be on screen at once", not "how many clips".
    // 8 was enough when only clips graded; a clip with 8 windows would have thrashed it back into
    // the per-frame re-bake this whole path exists to kill. Each cube is 33^3 * 4 = ~143KB, so 16
    // is ~2.3MB of VRAM.
    LUT3D_CACHE_MAX: 16,

    _uploadCube: function(grading) {
      var gl = this._gl;
      if (!gl || this._version !== 2) return false;
      var key = this._gradeKey(grading);
      if (!this._cubes) { this._cubes = {}; this._cubeLRU = []; }

      var hit = this._cubes[key];
      if (hit) {
        var at = this._cubeLRU.indexOf(key);
        if (at > -1) this._cubeLRU.splice(at, 1);
        this._cubeLRU.push(key);
        this._activeCube = hit;
        return true;
      }

      var cube = this._bakeCube(grading);
      if (!cube) return false;
      var N = this.LUT3D_SIZE;
      var tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, tex);
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA, N, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, cube);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);   // = hardware trilinear
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);

      this._cubes[key] = tex;
      this._cubeLRU.push(key);
      while (this._cubeLRU.length > this.LUT3D_CACHE_MAX) {
        var old = this._cubeLRU.shift();
        if (this._cubes[old]) { gl.deleteTexture(this._cubes[old]); delete this._cubes[old]; }
      }
      this._activeCube = tex;
      return true;
    },

    /* Upload a rasterised matte for one window. Keyed by the caller's `key`, which encodes the
       path + softness + frame size, so a matte is re-uploaded only when it actually changes: a
       window that is merely being LOOKED at costs one texture bind per frame, not a re-raster.
       Without the key check this would texImage2D a full-frame canvas every window every frame,
       which is exactly the per-frame CPU work the 3D-LUT cache exists to avoid. */
    _uploadMatte: function(key, srcFn) {
      var gl = this._gl;
      if (!gl || !srcFn) return null;
      if (!this._mattes) { this._mattes = {}; this._matteLRU = []; }
      var hit = this._mattes[key];
      if (hit) {
        var at = this._matteLRU.indexOf(key);
        if (at > -1) this._matteLRU.splice(at, 1);
        this._matteLRU.push(key);
        return hit;   // cache hit: the caller never rasterises at all
      }
      // Rasterised HERE, on the miss, immediately before the upload. The renderer draws every matte
      // into ONE shared scratch canvas, so if the caller rasterised all its windows up front they
      // would all hand over the same canvas holding the LAST window's pixels, and window 1 would be
      // masked by window 2's shape.
      var srcCanvas = srcFn();
      if (!srcCanvas) return null;
      var tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      // Same flip as the frame upload, or the matte would be vertically mirrored against the
      // picture it masks.
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, srcCanvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.activeTexture(gl.TEXTURE0);
      this._mattes[key] = tex;
      this._matteLRU.push(key);
      while (this._matteLRU.length > this.LUT3D_CACHE_MAX) {
        var old = this._matteLRU.shift();
        if (this._mattes[old]) { gl.deleteTexture(this._mattes[old]); delete this._mattes[old]; }
      }
      return tex;
    },

    canGradeOnGPU: function() {
      return !!(this._initialized && this._version === 2 && this._programs.lut3d && window.VEColorGrading);
    },

    _createFBOs: function(w, h) {
      var gl = this._gl;
      // Destroy old
      for (var i = 0; i < this._fbos.length; i++) {
        gl.deleteFramebuffer(this._fbos[i].fbo);
        gl.deleteTexture(this._fbos[i].tex);
      }
      this._fbos = [];

      // Create 2 FBOs for ping-pong
      for (var f = 0; f < 2; f++) {
        var tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        var fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

        this._fbos.push({ fbo: fbo, tex: tex, w: w, h: h });
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },

    /**
     * Upload video/canvas frame to GPU texture
     * @param {HTMLVideoElement|HTMLCanvasElement|ImageBitmap} source
     * @param {number} w, h
     * @returns {WebGLTexture}
     */
    uploadFrame: function(source, w, h) {
      var gl = this._gl;
      if (!gl) return null;

      if (!this._textures.input) {
        this._textures.input = gl.createTexture();
      }

      gl.bindTexture(gl.TEXTURE_2D, this._textures.input);
      /* A canvas's row 0 is its TOP. A GL texture sampled at v=0 is its BOTTOM, and the quad maps
         uv(0,0) to clip (-1,-1), which is the framebuffer's bottom. Upload without flipping and the
         source's top lands at the output's bottom: every pass comes out UPSIDE DOWN.
         Measured 2026-07-17 on an asymmetric fixture: comparing GPU against a vertically flipped
         CPU render gave a mean delta of EXACTLY 0, i.e. the maths was already perfect and only the
         orientation was wrong. Flipping here fixes every pass at once (chroma included, which was
         silently flipped too; a vertically symmetric test subject had hidden it). */
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);   // it is global state; leaving it on corrupts every other upload
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      // Resize FBOs if needed
      if (this._fbos.length === 0 || this._fbos[0].w !== w || this._fbos[0].h !== h) {
        this._createFBOs(w, h);
      }

      return this._textures.input;
    },

    /**
     * Run a shader program (ping-pong pattern)
     * @param {string} programName
     * @param {WebGLTexture} inputTex
     * @param {number} fboIdx — which FBO to render to (0 or 1)
     * @param {Object} uniforms — {name: value} pairs
     * @returns {number} next fboIdx
     */
    runPass: function(programName, inputTex, fboIdx, uniforms) {
      var gl = this._gl;
      var prog = this._programs[programName];
      if (!gl || !prog) return fboIdx;

      var fbo = this._fbos[fboIdx];
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo.fbo);
      gl.viewport(0, 0, fbo.w, fbo.h);

      gl.useProgram(prog);

      // Bind input texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, inputTex);
      gl.uniform1i(gl.getUniformLocation(prog, 'uTexture'), 0);

      // Set uniforms
      if (uniforms) {
        for (var name in uniforms) {
          var loc = gl.getUniformLocation(prog, name);
          if (!loc) continue;
          var val = uniforms[name];
          if (typeof val === 'number') {
            gl.uniform1f(loc, val);
          } else if (Array.isArray(val)) {
            if (val.length === 2) gl.uniform2fv(loc, val);
            else if (val.length === 3) gl.uniform3fv(loc, val);
            else if (val.length === 4) gl.uniform4fv(loc, val);
          }
        }
      }

      // Set texelSize uniform if exists
      var tsLoc = gl.getUniformLocation(prog, 'uTexelSize');
      if (tsLoc) gl.uniform2f(tsLoc, 1.0 / fbo.w, 1.0 / fbo.h);

      // Draw fullscreen quad
      var posLoc = gl.getAttribLocation(prog, 'aPos');
      var uvLoc = gl.getAttribLocation(prog, 'aUV');
      gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
      if (uvLoc >= 0) {
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
      }

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      return 1 - fboIdx; // alternate
    },

    /**
     * Full pipeline: upload → chroma key → color grade → read back
     */
    /* windows (optional): the power windows for this clip, ALREADY resolved to frame UV by the
       caller, each { rect:[x,y,w,h], shape, softness, invert, grade }. Resolving source space to
       frame space is the render's job, not this module's: only preview-render knows the clip's
       crop and fit. */
    processFrame: function(source, w, h, chromaSettings, gradingSettings, windows) {
      if (!this._initialized) return null;

      var gl = this._gl;
      var inputTex = this.uploadFrame(source, w, h);
      if (!inputTex) return null;

      var currentTex = inputTex;
      var nextFbo = 0;

      // Chroma key pass.
      /* The caller passes clip.chromaKey VERBATIM, whose canonical shape (set by the inspector and
         the effects library alike) is { color:'#rrggbb', similarity:0-1, smoothness:0-1, spill:0-1 }.
         This block used to read a DIFFERENT, never-produced shape (keyColor{r,g,b} / tolerance /
         spillSuppression, 0-100), so every user setting was silently ignored and the GPU keyed with
         hardcoded green defaults while the sliders did nothing. Canonical shape first; the legacy
         field names stay accepted as fallbacks. */
      if (chromaSettings && chromaSettings.enabled) {
        var kc;
        if (typeof chromaSettings.color === 'string') {
          var hx = chromaSettings.color.replace('#', '');
          kc = { r: parseInt(hx.substr(0, 2), 16) || 0, g: parseInt(hx.substr(2, 2), 16) || 0, b: parseInt(hx.substr(4, 2), 16) || 0 };
        } else kc = chromaSettings.keyColor || { r: 0, g: 255, b: 0 };
        var tol = (typeof chromaSettings.similarity === 'number') ? chromaSettings.similarity
                : (chromaSettings.tolerance || 40) / 100;
        var smo = (typeof chromaSettings.smoothness === 'number' && chromaSettings.smoothness <= 1) ? chromaSettings.smoothness
                : (chromaSettings.smoothness || 10) / 100;
        var spl = (typeof chromaSettings.spill === 'number') ? chromaSettings.spill
                : (chromaSettings.spillSuppression || 50) / 100;
        nextFbo = this.runPass('chromaKey', currentTex, nextFbo, {
          uKeyColor: [kc.r / 255, kc.g / 255, kc.b / 255],
          uTolerance: tol,
          uSmoothness: smo,
          uSpill: spl
        });
        currentTex = this._fbos[1 - nextFbo].tex;
      }

      // Color grade pass. ONE 3D-LUT lookup: it carries curves + levels + wheels + white balance +
      // saturation + the LUT-Browser/.cube, all baked together, so the per-frame cost does not
      // depend on how many grading features are switched on.
      if (gradingSettings && gradingSettings.enabled && this.canGradeOnGPU()) {
        if (this._uploadCube(gradingSettings)) {
          var lprog = this._programs.lut3d;
          gl.useProgram(lprog);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_3D, this._activeCube);
          gl.uniform1i(gl.getUniformLocation(lprog, 'uLUT3D'), 1);
          gl.uniform1f(gl.getUniformLocation(lprog, 'uSize'), this.LUT3D_SIZE);
          gl.activeTexture(gl.TEXTURE0);
          nextFbo = this.runPass('lut3d', currentTex, nextFbo, {});
          currentTex = this._fbos[1 - nextFbo].tex;
        }
      }

      // Power window passes. One pass per window, in array order, each reading the previous result,
      // so windows stack the way a user stacks them and a later window grades whatever an earlier
      // one already did. Measured cost is ~0.19ms per extra full-frame pass (plan P0.1), so ten
      // windows are ~3ms of a 16.67ms frame.
      if (windows && windows.length && this.canGradeOnGPU()) {
        for (var wi = 0; wi < windows.length; wi++) {
          var pw = windows[wi];
          // A window is described EITHER by a rect (analytic) OR by a matte (path). Demanding
          // pw.rect here silently skipped every pen/polygon/curve window: the shape rasterised
          // correctly, the shader compiled, and nothing was ever graded.
          // An op is a full-frame grade, an analytic window (rect/ellipse) or a matte window
          // (pen/polygon/curve). All three are one 3D-LUT lookup; only the mask differs.
          if (!pw || !pw.grade || !(pw.full || pw.rect || pw.matteFn)) continue;
          if (!this._uploadCube(pw.grade)) continue;

          var isMatte = !!(pw.matteFn && pw.matteKey);
          var pname = pw.full ? 'lut3d' : (isMatte ? 'lut3dmatte' : 'lut3dwin');
          var wprog = this._programs[pname];
          if (!wprog) break;
          gl.useProgram(wprog);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_3D, this._activeCube);
          gl.uniform1i(gl.getUniformLocation(wprog, 'uLUT3D'), 1);
          gl.uniform1f(gl.getUniformLocation(wprog, 'uSize'), this.LUT3D_SIZE);

          var uni;
          if (pw.full) {
            uni = {};
          } else if (isMatte) {
            var mtex = this._uploadMatte(pw.matteKey, pw.matteFn);
            if (!mtex) { gl.activeTexture(gl.TEXTURE0); continue; }
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, mtex);
            gl.uniform1i(gl.getUniformLocation(wprog, 'uMatte'), 2);
            uni = { uInvert: pw.invert ? 1 : 0 };
          } else {
            uni = {
              uWinRect: pw.rect,
              uSoftness: typeof pw.softness === 'number' ? pw.softness : 0.25,
              uInvert: pw.invert ? 1 : 0,
              uShape: pw.shape === 'linear' ? 2 : (pw.shape === 'ellipse' ? 1 : 0),
              uAspect: h > 0 ? (w / h) : 1,
              uAngle: pw.angle || 0
            };
          }
          gl.activeTexture(gl.TEXTURE0);
          nextFbo = this.runPass(pname, currentTex, nextFbo, uni);
          currentTex = this._fbos[1 - nextFbo].tex;
        }
      }

      // Read result back to canvas. Size-guarded: assigning width/height REALLOCATES the drawing
      // buffer even when the value is unchanged, and this ran every frame (the FBO path at init
      // already guards the same way). Reallocation per frame was a real part of "chroma key kasıyor".
      if (this._canvas.width !== w) this._canvas.width = w;
      if (this._canvas.height !== h) this._canvas.height = h;

      // Render final to screen (null framebuffer)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      var passProg = this._programs.passthrough;
      if (passProg) {
        gl.useProgram(passProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, currentTex);
        gl.uniform1i(gl.getUniformLocation(passProg, 'uTexture'), 0);

        var posLoc = gl.getAttribLocation(passProg, 'aPos');
        var uvLoc = gl.getAttribLocation(passProg, 'aUV');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        if (uvLoc >= 0) {
          gl.enableVertexAttribArray(uvLoc);
          gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      return this._canvas;
    },

    /**
     * Apply blur shader
     */
    applyBlur: function(source, w, h, radius) {
      if (!this._initialized) return null;
      var inputTex = this.uploadFrame(source, w, h);
      if (!inputTex) return null;

      // Horizontal blur
      var nextFbo = this.runPass('blur', inputTex, 0, {
        uDirection: [1.0, 0.0],
        uRadius: radius
      });
      var hTex = this._fbos[1 - nextFbo].tex;

      // Vertical blur
      nextFbo = this.runPass('blur', hTex, nextFbo, {
        uDirection: [0.0, 1.0],
        uRadius: radius
      });

      // Read back
      this._canvas.width = w;
      this._canvas.height = h;
      var gl = this._gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      var passProg = this._programs.passthrough;
      if (passProg) {
        gl.useProgram(passProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._fbos[1 - nextFbo].tex);
        gl.uniform1i(gl.getUniformLocation(passProg, 'uTexture'), 0);
        var posLoc = gl.getAttribLocation(passProg, 'aPos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        var uvLoc = gl.getAttribLocation(passProg, 'aUV');
        if (uvLoc >= 0) { gl.enableVertexAttribArray(uvLoc); gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8); }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      return this._canvas;
    },

    /**
     * Apply sharpen shader
     */
    applySharpen: function(source, w, h, amount) {
      if (!this._initialized) return null;
      var inputTex = this.uploadFrame(source, w, h);
      if (!inputTex) return null;

      var nextFbo = this.runPass('sharpen', inputTex, 0, { uAmount: amount });

      this._canvas.width = w;
      this._canvas.height = h;
      var gl = this._gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, w, h);
      var passProg = this._programs.passthrough;
      if (passProg) {
        gl.useProgram(passProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._fbos[1 - nextFbo].tex);
        gl.uniform1i(gl.getUniformLocation(passProg, 'uTexture'), 0);
        var posLoc = gl.getAttribLocation(passProg, 'aPos');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._quadBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
        var uvLoc = gl.getAttribLocation(passProg, 'aUV');
        if (uvLoc >= 0) { gl.enableVertexAttribArray(uvLoc); gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8); }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      return this._canvas;
    },

    isAvailable: function() {
      return this._initialized;
    },

    getVersion: function() {
      return this._version;
    },

    destroy: function() {
      if (!this._gl) return;
      var gl = this._gl;
      for (var name in this._programs) {
        gl.deleteProgram(this._programs[name]);
      }
      for (var tname in this._textures) {
        gl.deleteTexture(this._textures[tname]);
      }
      for (var fi = 0; fi < this._fbos.length; fi++) {
        gl.deleteFramebuffer(this._fbos[fi].fbo);
        gl.deleteTexture(this._fbos[fi].tex);
      }
      if (this._quadBuffer) gl.deleteBuffer(this._quadBuffer);
      this._programs = {};
      this._textures = {};
      this._fbos = [];
      this._gl = null;
      this._canvas = null;
      this._initialized = false;
    }
  };

  VEP._VS_FULLSCREEN =
    'attribute vec2 aPos;\n' +
    'attribute vec2 aUV;\n' +
    'varying vec2 vUV;\n' +
    'void main() {\n' +
    '  vUV = aUV;\n' +
    '  gl_Position = vec4(aPos, 0.0, 1.0);\n' +
    '}\n';

  VEP._FS_PASSTHROUGH =
    'varying vec2 vUV;\n' +
    'uniform sampler2D uTexture;\n' +
    'void main() {\n' +
    '  gl_FragColor = texture2D(uTexture, vUV);\n' +
    '}\n';

  VEP._FS_CHROMA_KEY =
    'varying vec2 vUV;\n' +
    'uniform sampler2D uTexture;\n' +
    'uniform vec3 uKeyColor;\n' +
    'uniform float uTolerance;\n' +
    'uniform float uSmoothness;\n' +
    'uniform float uSpill;\n' +
    'void main() {\n' +
    '  vec4 col = texture2D(uTexture, vUV);\n' +
    '  float pY  = 0.299*col.r + 0.587*col.g + 0.114*col.b;\n' +
    '  float pCb = -0.168736*col.r - 0.331264*col.g + 0.5*col.b;\n' +
    '  float pCr = 0.5*col.r - 0.418688*col.g - 0.081312*col.b;\n' +
    '  float kCb = -0.168736*uKeyColor.r - 0.331264*uKeyColor.g + 0.5*uKeyColor.b;\n' +
    '  float kCr = 0.5*uKeyColor.r - 0.418688*uKeyColor.g - 0.081312*uKeyColor.b;\n' +
    '  float dist = length(vec2(pCb - kCb, pCr - kCr)) / 0.7071;\n' +
    '  float alpha = smoothstep(uTolerance, uTolerance + uSmoothness, dist);\n' +
    '  // Spill suppression\n' +
    '  float spill = col.g - max(col.r, col.b);\n' +
    '  if (spill > 0.0) col.g -= spill * uSpill;\n' +
    '  gl_FragColor = vec4(col.rgb, col.a * alpha);\n' +
    '}\n';

  VEP._FS_COLOR_GRADE =
    'varying vec2 vUV;\n' +
    'uniform sampler2D uTexture;\n' +
    'uniform sampler2D uLUT;\n' +
    'void main() {\n' +
    '  vec4 col = texture2D(uTexture, vUV);\n' +
    '  float r = texture2D(uLUT, vec2(col.r, 0.5)).r;\n' +
    '  float g = texture2D(uLUT, vec2(col.g, 0.5)).g;\n' +
    '  float b = texture2D(uLUT, vec2(col.b, 0.5)).b;\n' +
    '  gl_FragColor = vec4(r, g, b, col.a);\n' +
    '}\n';

  /* THE 3D LUT PATH (GLSL ES 3.00, WebGL2 only).

     Why this exists and _FS_COLOR_GRADE does not suffice: that shader is three INDEPENDENT
     per-channel lookups, so it can express curves and levels and nothing else. Saturation, colour
     wheels, white balance and a .cube are all CROSS-channel: a 1D LUT is mathematically incapable
     of them. Wiring the old shader up would have applied the curves, silently dropped five of the
     seven grading features, and called it a speedup.

     A 3D LUT expresses ALL of them, because it is just a function (r,g,b) -> (r',g',b'). We bake the
     WHOLE grade into one cube by running the real CPU grader over its texels, so there is no second
     implementation of the grade to drift from the first. gl.LINEAR on a 3D texture IS trilinear
     interpolation, in hardware, for free: the shader is one lookup.

     Measured (docs/power-windows-plan.md P0): 334ms CPU -> 1.19ms GPU at full 1080p (~281x), and
     max pixel delta 1 vs the CPU path. */
  VEP._VS_LUT3D =
    '#version 300 es\n' +
    'in vec2 aPos;\n' +
    'in vec2 aUV;\n' +
    'out vec2 vUV;\n' +
    'void main() {\n' +
    '  vUV = aUV;\n' +
    '  gl_Position = vec4(aPos, 0.0, 1.0);\n' +
    '}\n';

  VEP._FS_LUT3D =
    '#version 300 es\n' +
    'precision highp float;\n' +
    'precision highp sampler3D;\n' +
    'in vec2 vUV;\n' +
    'out vec4 outColor;\n' +
    'uniform sampler2D uTexture;\n' +
    'uniform sampler3D uLUT3D;\n' +
    'uniform float uSize;\n' +
    'void main() {\n' +
    '  vec4 c = texture(uTexture, vUV);\n' +
    // Half-texel inset. Without it the cube's edge texels clamp and the extremes shift: pure black
    // and pure white stop being themselves.
    '  float s = (uSize - 1.0) / uSize;\n' +
    '  float o = 1.0 / (2.0 * uSize);\n' +
    '  outColor = vec4(texture(uLUT3D, c.rgb * s + o).rgb, c.a);\n' +
    '}\n';

  /* THE POWER WINDOW PASS (GLSL ES 3.00, WebGL2 only).

     Same 3D-LUT lookup as _FS_LUT3D, but the graded result is mix()ed back over the original by a
     shape mask, so the grade lands ONLY inside the window. One window = one pass over the frame,
     each with its own cube, so a window's grade is the full grader (wheels, WB, .cube, curves),
     not a reduced subset.

     The shape is computed analytically rather than sampled from a rasterised matte texture: for a
     rect and an ellipse it is exact at any resolution, needs no matte upload and no separate blur
     pass for the feather. Poly and curve windows cannot be done this way and will need a real
     matte (that is why uShape is a float and not a bool).

     Everything is in the frame's UV space. uAspect rescales to square units before any distance is
     taken, otherwise the softness feather would be visibly wider horizontally than vertically on a
     16:9 frame, and an "ellipse" would not be the shape the user drew. */
  VEP._FS_LUT3D_WINDOW =
    '#version 300 es\n' +
    'precision highp float;\n' +
    'precision highp sampler3D;\n' +
    'in vec2 vUV;\n' +
    'out vec4 outColor;\n' +
    'uniform sampler2D uTexture;\n' +
    'uniform sampler3D uLUT3D;\n' +
    'uniform float uSize;\n' +
    'uniform vec4 uWinRect;\n' +   // x, y, w, h in frame UV (y already flipped to GL convention)
    'uniform float uSoftness;\n' + // 0..1 of the window's smaller half-axis
    'uniform float uInvert;\n' +
    'uniform float uShape;\n' +    // 0 = rect, 1 = ellipse
    'uniform float uAspect;\n' +   // frameW / frameH
    'uniform float uAngle;\n' +    // window rotation, radians (0 for the axis-aligned default)
    'void main() {\n' +
    '  vec4 c = texture(uTexture, vUV);\n' +
    '  float s = (uSize - 1.0) / uSize;\n' +
    '  float o = 1.0 / (2.0 * uSize);\n' +
    '  vec3 graded = texture(uLUT3D, c.rgb * s + o).rgb;\n' +
    '  vec2 A = vec2(uAspect, 1.0);\n' +
    '  vec2 ctr = (uWinRect.xy + uWinRect.zw * 0.5) * A;\n' +
    '  vec2 hlf = max(uWinRect.zw * 0.5 * A, vec2(1e-5));\n' +
    '  vec2 p = vUV * A - ctr;\n' +
    // Aspect-corrected space is isotropic (h pixels per unit on both axes), so a rotation by uAngle
    // here is a rotation by the same angle in pixel space. Rotate the sample point by -uAngle about
    // the centre before the axis-aligned shape test -> the shape itself appears rotated by +uAngle.
    '  float ca = cos(uAngle), sa = sin(uAngle);\n' +
    '  p = vec2(ca * p.x + sa * p.y, -sa * p.x + ca * p.y);\n' +
    '  float m;\n' +
    '  if (uShape < 0.5) {\n' +
    '    float f = max(uSoftness * min(hlf.x, hlf.y), 1e-5);\n' +
    '    vec2 d = abs(p) - hlf;\n' +
    '    m = (1.0 - smoothstep(-f, 0.0, d.x)) * (1.0 - smoothstep(-f, 0.0, d.y));\n' +
    '  } else if (uShape < 1.5) {\n' +
    '    float r = length(p / hlf);\n' +
    '    float inner = 1.0 - clamp(uSoftness, 0.001, 0.999);\n' +
    '    m = 1.0 - smoothstep(inner, 1.0, r);\n' +
    '  } else {\n' +
    // LINEAR: a directional gradient bounded by the drawn box. A transition centred on the box centre
    // line runs along local +Y: full grade on the +Y side, none on the -Y side. Softness is the band
    // WIDTH (0 = a hard split at the centre line, 1 = a gradient across the whole box height). Bounded
    // on X by the same soft rect falloff so the effect matches the box the user drew.
    '    float f = max(uSoftness * min(hlf.x, hlf.y), 1e-5);\n' +
    '    float gx = 1.0 - smoothstep(-f, 0.0, abs(p.x) - hlf.x);\n' +
    '    float band = max(uSoftness * hlf.y, 1e-4);\n' +
    '    float t = smoothstep(-band, band, p.y);\n' +
    '    m = gx * t;\n' +
    '  }\n' +
    '  m = mix(m, 1.0 - m, uInvert);\n' +
    '  outColor = vec4(mix(c.rgb, graded, m), c.a);\n' +
    '}\n';

  /* THE MATTE-TEXTURE WINDOW PASS (GLSL ES 3.00, WebGL2 only).

     _FS_LUT3D_WINDOW computes its shape analytically, which is exact and free but only expresses a
     rect and an ellipse. A pen/polygon/curve window is an arbitrary path: there is no closed form,
     so its mask is RASTERISED on the CPU (fabric already knows how to fill a Path), blurred for the
     feather, and sampled here. One texture read replaces the whole shape computation.

     Kept as a SEPARATE program rather than a branch in the analytic one: a rect must not pay for a
     matte upload, and a matte window must not pay for shape maths it ignores. */
  VEP._FS_LUT3D_MATTE =
    '#version 300 es\n' +
    'precision highp float;\n' +
    'precision highp sampler3D;\n' +
    'in vec2 vUV;\n' +
    'out vec4 outColor;\n' +
    'uniform sampler2D uTexture;\n' +
    'uniform sampler2D uMatte;\n' +
    'uniform sampler3D uLUT3D;\n' +
    'uniform float uSize;\n' +
    'uniform float uInvert;\n' +
    'void main() {\n' +
    '  vec4 c = texture(uTexture, vUV);\n' +
    '  float s = (uSize - 1.0) / uSize;\n' +
    '  float o = 1.0 / (2.0 * uSize);\n' +
    '  vec3 graded = texture(uLUT3D, c.rgb * s + o).rgb;\n' +
    '  float m = texture(uMatte, vUV).r;\n' +
    '  m = mix(m, 1.0 - m, uInvert);\n' +
    '  outColor = vec4(mix(c.rgb, graded, m), c.a);\n' +
    '}\n';

  VEP._FS_BLUR =
    'varying vec2 vUV;\n' +
    'uniform sampler2D uTexture;\n' +
    'uniform vec2 uDirection;\n' +
    'uniform float uRadius;\n' +
    'uniform vec2 uTexelSize;\n' +
    'void main() {\n' +
    '  vec4 sum = vec4(0.0);\n' +
    '  float weights[5];\n' +
    '  weights[0] = 0.2270270270;\n' +
    '  weights[1] = 0.1945945946;\n' +
    '  weights[2] = 0.1216216216;\n' +
    '  weights[3] = 0.0540540541;\n' +
    '  weights[4] = 0.0162162162;\n' +
    '  sum += texture2D(uTexture, vUV) * weights[0];\n' +
    '  for (int i = 1; i < 5; i++) {\n' +
    '    vec2 off = uDirection * float(i) * uTexelSize * uRadius;\n' +
    '    sum += texture2D(uTexture, vUV + off) * weights[i];\n' +
    '    sum += texture2D(uTexture, vUV - off) * weights[i];\n' +
    '  }\n' +
    '  gl_FragColor = sum;\n' +
    '}\n';

  VEP._FS_SHARPEN =
    'varying vec2 vUV;\n' +
    'uniform sampler2D uTexture;\n' +
    'uniform float uAmount;\n' +
    'uniform vec2 uTexelSize;\n' +
    'void main() {\n' +
    '  vec4 center = texture2D(uTexture, vUV);\n' +
    '  vec4 n = texture2D(uTexture, vUV + vec2(0.0, -uTexelSize.y));\n' +
    '  vec4 s = texture2D(uTexture, vUV + vec2(0.0,  uTexelSize.y));\n' +
    '  vec4 e = texture2D(uTexture, vUV + vec2( uTexelSize.x, 0.0));\n' +
    '  vec4 w = texture2D(uTexture, vUV + vec2(-uTexelSize.x, 0.0));\n' +
    '  vec4 edge = 4.0 * center - n - s - e - w;\n' +
    '  gl_FragColor = center + edge * uAmount;\n' +
    '}\n';

  if (window.cc && cc.modules) {
    cc.modules.register({ id: 'webgl', parent: 'video.ve-performance', title: 've-performance: webgl', mount: function () {}, unmount: function () {} });
  }
})();
