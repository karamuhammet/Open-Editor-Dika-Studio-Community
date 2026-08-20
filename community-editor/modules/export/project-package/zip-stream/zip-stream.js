/* ===== Streaming STORE-only ZIP reader/writer (docs/project-package-export-plan.md) =====

   WHY THIS EXISTS INSTEAD OF JSZip.

   The package writer was first built on JSZip's generateInternalStream, on the assumption that
   `zip.file(name, blob)` keeps the bytes in the Blob (browser-owned storage) and reads them lazily
   while generating. Measured on 2026-08-02 in this editor, that is false:

       60 MB archive  ->  38 MB JS heap growth
      180 MB archive  -> 470 MB JS heap growth   (peak 507 MB)
      200 MB archive  -> 190 MB JS heap growth

   Growth is at best proportional and at worst several times the archive, which puts a real project
   straight into the ~512 MB single-artifact wall CLAUDE.md already records. The import half was worse
   in kind, not just degree: `JSZip.loadAsync(arrayBuffer)` requires the ENTIRE package in memory
   before a single entry can be read, so a large package could be written but never opened.

   A media package is STORE-only (never compressed: mp4/webm/jpg are already compressed, so DEFLATE
   would burn CPU per GB and return nothing). For STORE, the bytes in the archive ARE the file's
   bytes, which makes both directions cheap without a general-purpose zip library:

     writing  stream the entry's chunks straight through to disk, computing CRC32 as they pass.
              Peak memory is one chunk (4 MB), whatever the archive size.
     reading  parse the central directory (a few KB from the end of the file), then hand back
              `file.slice(dataStart, dataStart + size)`. That is a VIEW of the file on disk, so a
              3 GB entry costs no heap at all until somebody reads it.

   ZIP64 is implemented, not skipped: video crosses 4 GB in practice, and a silent 32-bit wrap would
   produce a corrupt archive that only fails on the recipient's machine.

   Produces standard archives (verified re-readable by JSZip) and reads standard archives. */

(function (global) {
  'use strict';

  var CHUNK = 4 * 1024 * 1024;
  var U32_MAX = 0xFFFFFFFF;
  var U16_MAX = 0xFFFF;

  /* ── CRC32 ─────────────────────────────────────────────────────────────────────────────────── */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crcUpdate(crc, buf) {
    var c = crc;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return c >>> 0;
  }

  /* ── byte writing helpers ──────────────────────────────────────────────────────────────────── */
  function Buf(size) {
    this.b = new Uint8Array(size);
    this.dv = new DataView(this.b.buffer);
    this.p = 0;
  }
  Buf.prototype.u16 = function (v) { this.dv.setUint16(this.p, v & 0xFFFF, true); this.p += 2; return this; };
  Buf.prototype.u32 = function (v) { this.dv.setUint32(this.p, v >>> 0, true); this.p += 4; return this; };
  Buf.prototype.u64 = function (v) {
    // Sizes come from Blob.size / running offsets, so they are safe integers, not BigInt.
    var lo = v % 4294967296, hi = Math.floor(v / 4294967296);
    this.dv.setUint32(this.p, lo >>> 0, true); this.dv.setUint32(this.p + 4, hi >>> 0, true);
    this.p += 8; return this;
  };
  Buf.prototype.bytes = function (arr) { this.b.set(arr, this.p); this.p += arr.length; return this; };
  Buf.prototype.done = function () { return this.b.subarray(0, this.p); };

  function utf8(str) {
    if (global.TextEncoder) return new TextEncoder().encode(str);
    var out = [], s = unescape(encodeURIComponent(str));
    for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return new Uint8Array(out);
  }

  function dosTime(d) {
    return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  }
  function dosDate(d) {
    return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  }

  function toBlob(data) {
    if (data instanceof Blob) return data;
    if (typeof data === 'string') return new Blob([data], { type: 'application/json' });
    return new Blob([data]);
  }

  /* Read a Blob in bounded chunks. Uses slice+arrayBuffer rather than Blob.stream so the peak is a
     predictable CHUNK regardless of what the browser's stream implementation buffers. */
  function eachChunk(blob, onChunk) {
    var pos = 0;
    function step() {
      if (pos >= blob.size) return Promise.resolve();
      var end = Math.min(pos + CHUNK, blob.size);
      var slice = blob.slice(pos, end);
      pos = end;
      return (slice.arrayBuffer ? slice.arrayBuffer() : legacyRead(slice))
        .then(function (ab) { return onChunk(new Uint8Array(ab)); })
        .then(step);
    }
    return step();
  }

  function legacyRead(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error('blob-read-failed')); };
      fr.readAsArrayBuffer(blob);
    });
  }

  /* ── Sinks ─────────────────────────────────────────────────────────────────────────────────── */

  /* Streams every byte to a File System Access writable. Each write is awaited before the next read,
     which is the backpressure: bytes cannot pile up ahead of the disk. */
  function streamSink(writable, onProgress) {
    var written = 0;
    return {
      streamed: true,
      write: function (u8) {
        return writable.write(u8).then(function () {
          written += u8.length;
          if (onProgress) onProgress(written);
        });
      },
      // A whole entry: chunk it through, so a 3 GB clip never exists in memory.
      writeBlob: function (blob, onCrc) {
        var crc = 0xFFFFFFFF;
        var self = this;
        return eachChunk(blob, function (chunk) {
          crc = crcUpdate(crc, chunk);
          return self.write(chunk);
        }).then(function () { onCrc((crc ^ 0xFFFFFFFF) >>> 0); });
      },
      finish: function () { return writable.close().then(function () { return { streamed: true, bytes: written }; }); }
    };
  }

  /* Fallback for browsers without File System Access. Still memory-safe: the entry's Blob is pushed
     into the parts list BY REFERENCE and the browser assembles the final Blob from its own storage.
     The chunk loop here exists only to compute CRC32; those chunks are released as they go. */
  function blobSink(onProgress) {
    var parts = [], written = 0;
    return {
      streamed: false,
      write: function (u8) {
        parts.push(u8.slice(0));
        written += u8.length;
        if (onProgress) onProgress(written);
        return Promise.resolve();
      },
      writeBlob: function (blob, onCrc) {
        var crc = 0xFFFFFFFF;
        return eachChunk(blob, function (chunk) { crc = crcUpdate(crc, chunk); })
          .then(function () {
            parts.push(blob);                 // by reference: no copy into heap
            written += blob.size;
            if (onProgress) onProgress(written);
            onCrc((crc ^ 0xFFFFFFFF) >>> 0);
          });
      },
      finish: function () {
        var blob = new Blob(parts, { type: 'application/zip' });
        return Promise.resolve({ streamed: false, bytes: blob.size, blob: blob });
      }
    };
  }

  /* ── Writer ────────────────────────────────────────────────────────────────────────────────── */

  /* entries: [{ name, data: Blob|string|Uint8Array }]
     Local headers use the data-descriptor flag (bit 3) because CRC32 is only known after the bytes
     have streamed past; the central directory written at the end carries the authoritative values. */
  function writeZip(entries, sink) {
    var now = new Date();
    var time = dosTime(now), date = dosDate(now);
    var records = [];
    var offset = 0;

    function bump(n) { offset += n; }

    function writeEntry(e) {
      var blob = toBlob(e.data);
      var nameBytes = utf8(e.name);
      var size = blob.size;
      var needs64 = size >= U32_MAX || offset >= U32_MAX;
      var localOffset = offset;

      var h = new Buf(30 + nameBytes.length);
      h.u32(0x04034b50);
      h.u16(needs64 ? 45 : 20);        // version needed
      h.u16(0x0808);                   // bit 3 data descriptor + bit 11 UTF-8 name
      h.u16(0);                        // method: STORE
      h.u16(time); h.u16(date);
      h.u32(0); h.u32(0); h.u32(0);    // crc + sizes live in the descriptor
      h.u16(nameBytes.length); h.u16(0);
      h.bytes(nameBytes);
      var head = h.done();

      return sink.write(head).then(function () {
        bump(head.length);
        var crcOut = 0;
        return sink.writeBlob(blob, function (c) { crcOut = c; }).then(function () {
          bump(size);
          var d = new Buf(needs64 ? 24 : 16);
          d.u32(0x08074b50).u32(crcOut);
          if (needs64) { d.u64(size); d.u64(size); } else { d.u32(size); d.u32(size); }
          var desc = d.done();
          return sink.write(desc).then(function () {
            bump(desc.length);
            records.push({ name: nameBytes, crc: crcOut, size: size, offset: localOffset, zip64: needs64 });
          });
        });
      });
    }

    return entries.reduce(function (chain, e) {
      return chain.then(function () { return writeEntry(e); });
    }, Promise.resolve()).then(function () {
      var cdStart = offset;

      return records.reduce(function (chain, r) {
        return chain.then(function () {
          var big = r.zip64 || r.size >= U32_MAX || r.offset >= U32_MAX;
          var extraLen = big ? 4 + 24 : 0;
          var c = new Buf(46 + r.name.length + extraLen);
          c.u32(0x02014b50);
          c.u16(big ? 45 : 20);          // version made by
          c.u16(big ? 45 : 20);          // version needed
          c.u16(0x0808);
          c.u16(0);                      // STORE
          c.u16(time); c.u16(date);
          c.u32(r.crc);
          c.u32(big ? U32_MAX : r.size);
          c.u32(big ? U32_MAX : r.size);
          c.u16(r.name.length);
          c.u16(extraLen);
          c.u16(0); c.u16(0); c.u16(0);  // comment, disk, internal attrs
          c.u32(0);                      // external attrs
          c.u32(big ? U32_MAX : r.offset);
          c.bytes(r.name);
          if (big) {
            c.u16(0x0001); c.u16(24);
            c.u64(r.size); c.u64(r.size); c.u64(r.offset);
          }
          var buf = c.done();
          return sink.write(buf).then(function () { bump(buf.length); });
        });
      }, Promise.resolve()).then(function () {
        var cdSize = offset - cdStart;
        var need64 = records.length > U16_MAX || cdStart >= U32_MAX || cdSize >= U32_MAX;
        var tail;

        if (need64) {
          var z = new Buf(56 + 20 + 22);
          z.u32(0x06064b50).u64(44);            // EOCD64 record, size of remainder
          z.u16(45).u16(45).u32(0).u32(0);
          z.u64(records.length).u64(records.length).u64(cdSize).u64(cdStart);
          z.u32(0x07064b50).u32(0).u64(cdStart + cdSize).u32(1);   // EOCD64 locator
          z.u32(0x06054b50).u16(0).u16(0).u16(U16_MAX).u16(U16_MAX).u32(U32_MAX).u32(U32_MAX).u16(0);
          tail = z.done();
        } else {
          var t = new Buf(22);
          t.u32(0x06054b50).u16(0).u16(0);
          t.u16(records.length).u16(records.length);
          t.u32(cdSize).u32(cdStart).u16(0);
          tail = t.done();
        }
        return sink.write(tail).then(function () { return sink.finish(); });
      });
    });
  }

  /* ── Reader ────────────────────────────────────────────────────────────────────────────────── */

  function readSlice(file, start, end) {
    var s = file.slice(start, Math.min(end, file.size));
    return (s.arrayBuffer ? s.arrayBuffer() : legacyRead(s)).then(function (ab) { return new DataView(ab); });
  }

  /* Parses the central directory only (a few KB), so opening a 3 GB package is as cheap as opening a
     small one. Entry bytes are handed out later as slices of the file itself. */
  function openZip(file) {
    var tailLen = Math.min(file.size, 65557 + 64);
    return readSlice(file, file.size - tailLen, file.size).then(function (dv) {
      var eocd = -1;
      for (var i = dv.byteLength - 22; i >= 0; i--) {
        if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
      }
      if (eocd < 0) throw new Error('not-a-zip');

      var total = dv.getUint16(eocd + 10, true);
      var cdSize = dv.getUint32(eocd + 12, true);
      var cdOffset = dv.getUint32(eocd + 16, true);

      if (total === U16_MAX || cdOffset === U32_MAX || cdSize === U32_MAX) {
        // ZIP64: the locator sits immediately before the EOCD and points at the real record.
        var loc = eocd - 20;
        if (loc < 0 || dv.getUint32(loc, true) !== 0x07064b50) throw new Error('zip64-locator-missing');
        var z64lo = dv.getUint32(loc + 8, true), z64hi = dv.getUint32(loc + 12, true);
        var z64Off = z64hi * 4294967296 + z64lo;
        return readSlice(file, z64Off, z64Off + 56).then(function (z) {
          if (z.getUint32(0, true) !== 0x06064b50) throw new Error('zip64-record-missing');
          total = z.getUint32(32, true) + z.getUint32(36, true) * 4294967296;
          cdSize = z.getUint32(40, true) + z.getUint32(44, true) * 4294967296;
          cdOffset = z.getUint32(48, true) + z.getUint32(52, true) * 4294967296;
          return parseCd(file, cdOffset, cdSize, total);
        });
      }
      return parseCd(file, cdOffset, cdSize, total);
    });
  }

  function parseCd(file, cdOffset, cdSize, total) {
    return readSlice(file, cdOffset, cdOffset + cdSize).then(function (dv) {
      var map = {}, names = [], p = 0;
      for (var n = 0; n < total && p + 46 <= dv.byteLength; n++) {
        if (dv.getUint32(p, true) !== 0x02014b50) break;
        var method = dv.getUint16(p + 10, true);
        var size = dv.getUint32(p + 24, true);
        var nameLen = dv.getUint16(p + 28, true);
        var extraLen = dv.getUint16(p + 30, true);
        var commentLen = dv.getUint16(p + 32, true);
        var lOffset = dv.getUint32(p + 42, true);

        var nameBytes = new Uint8Array(dv.buffer, dv.byteOffset + p + 46, nameLen);
        var name = global.TextDecoder ? new TextDecoder().decode(nameBytes)
          : String.fromCharCode.apply(null, nameBytes);

        if (size === U32_MAX || lOffset === U32_MAX) {
          // Pull the true 64-bit values out of the 0x0001 extra field, in its defined order.
          var ep = p + 46 + nameLen, eEnd = ep + extraLen;
          while (ep + 4 <= eEnd) {
            var tag = dv.getUint16(ep, true), len = dv.getUint16(ep + 2, true), q = ep + 4;
            if (tag === 0x0001) {
              if (size === U32_MAX) { size = dv.getUint32(q, true) + dv.getUint32(q + 4, true) * 4294967296; q += 16; }
              if (lOffset === U32_MAX) { lOffset = dv.getUint32(q, true) + dv.getUint32(q + 4, true) * 4294967296; }
              break;
            }
            ep = ep + 4 + len;
          }
        }

        map[name] = { size: size, method: method, localOffset: lOffset };
        names.push(name);
        p += 46 + nameLen + extraLen + commentLen;
      }

      function dataStart(rec) {
        // The local header's name/extra lengths can differ from the central copy, so read it.
        return readSlice(file, rec.localOffset, rec.localOffset + 30).then(function (lh) {
          if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('bad-local-header');
          return rec.localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        });
      }

      return {
        names: names,
        has: function (name) { return !!map[name]; },
        size: function (name) { return map[name] ? map[name].size : 0; },
        /* Zero-copy: a view of the file on disk. Nothing is read until somebody consumes it. */
        blob: function (name) {
          var rec = map[name];
          if (!rec) return Promise.reject(new Error('no-entry:' + name));
          if (rec.method !== 0) return Promise.reject(new Error('compressed-entry-unsupported:' + name));
          return dataStart(rec).then(function (start) { return file.slice(start, start + rec.size); });
        },
        text: function (name) {
          return this.blob(name).then(function (b) {
            return b.text ? b.text() : legacyRead(b).then(function (ab) { return new TextDecoder().decode(ab); });
          });
        }
      };
    });
  }

  global.CCZipStream = {
    writeZip: writeZip,
    streamSink: streamSink,
    blobSink: blobSink,
    openZip: openZip,
    CHUNK: CHUNK
  };
})(window);
