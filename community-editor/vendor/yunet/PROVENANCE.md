# YuNet face detector - provenance and integrity

**Why this file exists:** the owner's question was "who else uses this repo, could it carry a virus".
That question deserves a durable answer, not a chat message. Anyone can re-verify every claim below
from this file alone.

## What this is

`face_detection_yunet_2023mar.onnx` - a 232,589-byte ONNX model. **Data, not code.** It does not
execute; `onnxruntime-web` parses it. (The format that *can* run arbitrary code on load is PyTorch
`.pt`/`.pth`, which uses pickle. ONNX is protobuf and is not that.)

## Where it came from

| | |
|---|---|
| Repo | `github.com/opencv/opencv_zoo` |
| Path | `models/face_detection_yunet/face_detection_yunet_2023mar.onnx` |
| **Pinned commit** | **`f12e12798e8314f7c074a6656816c048dcc95b7a`** (2023-06-06) |
| Fetched via | `media.githubusercontent.com/media/...` (Git LFS content, NOT the `raw.` pointer) |
| Author | Shiqi Yu (`shiqi.yu@gmail.com`) |
| Licence | **MIT** (see `LICENSE` beside this file, taken from the same commit) |

**Pinned to a commit, never `main`.** Re-fetching must use the SHA above, so the bytes can never
change under us.

## Integrity

```
sha256  8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
size    232589
```

**This hash is not our own claim.** The Git LFS pointer committed into opencv_zoo's history at
`f12e1279` declares `oid sha256:8f2383e4...` and `size 232589`. Our download matched both exactly, so
the file is byte-identical to what OpenCV committed. Re-verify at any time:

```bash
sha256sum apps/editor/vendor/yunet/face_detection_yunet_2023mar.onnx
curl -s https://raw.githubusercontent.com/opencv/opencv_zoo/f12e12798e8314f7c074a6656816c048dcc95b7a/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
# the second prints the LFS pointer, whose oid must equal the first
```

Structural check performed at install: first byte `0x08` (ONNX `ir_version` field), producer
`pytorch`, ops `Conv / Relu / MaxPool / Add / Reshape / Sigmoid`. A real CNN, consistent with a face
detector.

## Why THIS model, and why it is not an obscure project

**YuNet is OpenCV's official face detector.** It is not a third-party side project that OpenCV happens
to host:

- OpenCV adopted it into **core** as the `FaceDetectorYN` API:
  `opencv/opencv` -> `modules/objdetect/include/opencv2/objdetect/face.hpp`, `class CV_EXPORTS_W FaceDetectorYN`.
  It replaced the 2001-era Haar cascade as OpenCV's modern DNN face detector.
- **OpenCV's own tutorial points at the exact directory we took this from**:
  `opencv/opencv` -> `doc/tutorials/dnn/dnn_face/dnn_face.markdown` links to
  `github.com/opencv/opencv_zoo/tree/master/models/face_detection_yunet`. We did not choose the
  source; OpenCV's documentation did.
- `opencv_zoo` is owned by the **same GitHub account as `opencv/opencv`** (owner id `5009934`), so it
  is not a look-alike repo.
- Star counts, measured 2026-07-17: `opencv/opencv` **89,961** (committed that day);
  `ShiqiYu/libfacedetection` (YuNet's origin) **12,761**. `opencv_zoo` itself shows ~991 because it is
  a model *store*, not a project - that number is not a signal of adoption and should not be read as one.

Upstream origin: `github.com/ShiqiYu/libfacedetection` (C++ + training code). We deliberately take
**only the `.onnx`** from opencv_zoo; we do not vendor or build that C++.

## Why vendored instead of a CDN

A pinned, hashed, local file is a **smaller** supply-chain surface than the alternative. The path this
replaces (`@mediapipe/face_mesh` via jsdelivr, `motion-tracking.js`) fetches **live JavaScript on every
user's session**: a hijacked package reaches every user immediately. This file is frozen, hashed, and
never touches the network at runtime.

## Licence obligation we must meet

MIT requires the copyright and permission notice to ship with any distribution. `LICENSE` sits beside
this file for that reason. **Do not delete it**, and if the model is ever moved, move the LICENSE with
it.

> **Model-licence trap, recorded so it is not re-learned:** a project's CODE licence and its WEIGHTS
> licence can differ. SCRFD, the obvious alternative to this model, is MIT code with weights
> restricted to "non-commercial research purposes only", which would be unusable in a product we sell.
> YuNet's MIT covers the weights themselves, which is exactly why it was chosen. Any future model swap
> must check the WEIGHTS licence separately.
