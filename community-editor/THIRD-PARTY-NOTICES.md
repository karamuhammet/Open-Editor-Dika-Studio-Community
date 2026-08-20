# Third-party notices

dika studio Community Editor ships the components below. Their licences apply to those components and
continue to apply after redistribution. This file exists to satisfy the attribution those licences
require, and it lists **only what is actually in this tree**: if a component is named here, the file
is in the repository, and if a file is in the repository, it is named here.

The main dika studio product has its own notices file. Do not copy this one to it or the other way
round: the two ship different things.

## Browser libraries (`vendor/lib/`)

| Component | Version | Licence | File |
|---|---|---|---|
| Fabric.js | 5.3.1 | MIT | `fabric.min.js` |
| qrcode-generator | 1.4.4 | MIT | `qrcode.min.js` |
| JSZip | 3.10.1 | MIT or GPL-3.0 (dual) | `jszip.min.js` |
| PapaParse | 5.4.1 | MIT | `papaparse.min.js` |
| Swiper | 12.2.0 | MIT | `swiper-bundle.min.js`, `swiper-bundle.min.css` |
| anime.js | 3.2.2 | MIT | `anime.min.js` |

**GSAP is deliberately NOT shipped.** It is free of charge but not an OSI licence, and this edition
is redistributed under the BUSL-1.1. The slide deck was ported to anime.js. Do not add it back without a
licence answer in writing.

## Other bundled libraries

| Component | Licence | File |
|---|---|---|
| mp4-muxer | MIT | `vendor/mp4-muxer.min.js` |
| Mediabunny | MIT | `vendor/mediabunny.min.mjs` |
| Transformers.js (`@huggingface/transformers` 3.1.2) | Apache-2.0 | `vendor/transformers/transformers.js` |
| ONNX Runtime Web (bundled with the above and with the cutout runtime) | MIT | `vendor/transformers/ort-wasm-simd-threaded.jsep.wasm`, `vendor/cutout/ort-wasm-simd-threaded.{mjs,wasm}`, `vendor/cutout/ort.wasm.bundle.min.mjs`, `vendor/upscale/*` |
| browser-image-compression | MIT | `js/vendor/browser-image-compression.js` |
| omggif | MIT | `js/vendor/omggif.js` |
| opentype.js | MIT | `js/vendor/opentype.min.js` |
| Lucide icons | ISC | `js/vendor-lucide.js` |

## On-device models

Model weights are DATA, not code: an ONNX file is protobuf and is parsed by onnxruntime, it does not
execute. (The format that can run code on load is PyTorch `.pt` / `.pth`, which uses pickle. These
are not that.)

| Model | Use | Licence | File |
|---|---|---|---|
| IS-Net (general use), fp16 | Background removal / cutout | MIT | `vendor/cutout/isnet-general-fp16.onnx` |
| Swin2SR | Image upscaling (2x, chained for 4x) | Apache-2.0 | `vendor/upscale/swin2sr-x2.onnx` |
| Silero VAD v5 | Speech detection before transcription | MIT | `vendor/vad/silero_vad_v5.onnx` |
| YuNet (`face_detection_yunet_2023mar`) | Face detection | MIT | `vendor/yunet/face_detection_yunet_2023mar.onnx` |

- The **fp32** IS-Net weight (167 MB) was removed from this edition. The fp16 build measured an IoU
  of 1.000 against it, so the second copy cost 167 MB for no visible difference in the result.
- YuNet ships with its own `LICENSE` and a `PROVENANCE.md` recording the exact upstream repository,
  the pinned commit and the fetch method. Keep both files with the model.
- **Whisper** (`onnx-community/whisper-large-v3-turbo`) is NOT shipped. It is downloaded from
  huggingface.co the first time somebody generates subtitles, and cached by the browser. Its licence
  is the upstream model's.

## Fonts (`vendor/fonts/`)

Sixteen families, downloaded from Google Fonts and vendored so the build makes no network request.
All are under the SIL Open Font License 1.1 except where noted by their own upstream:

Geist, Geist Mono, Playfair Display, DM Sans, Space Mono, Cormorant Garamond, Unbounded, Lora,
Bebas Neue, Josefin Sans, Outfit, Anton, Abril Fatface, Dancing Script, Oswald, Pacifico.

Reproduce the download with `node tools/vendor-assets.mjs`.

## Removed from this edition

Listed so nobody has to diff two trees to find out. Each was removed because it only worked with the
dika studio service, or because it could not be redistributed under this licence:

GSAP, the ElevenLabs and Deepgram integrations, the AI chat and its skills, the ad overlay, the
co-editing CRDT bundle (`vendor/collab`), and the unused ffmpeg build (`vendor/ffmpeg`, 23.6 MB, dead
since the editor moved to WebCodecs).
