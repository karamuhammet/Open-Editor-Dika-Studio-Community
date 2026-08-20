# Security policy

## Reporting

Do not open a public issue for a vulnerability. Report it privately through the repository's security
advisory form, or by email to the address in the README.

Please include: the build you used (double-clicked file, static server, or desktop), the browser and
version, what you did, and what happened. A proof of concept helps more than a description.

## What this build's threat model actually is

Worth stating plainly, because it changes what counts as a vulnerability here:

- **There is no server and no account.** No session, no credentials of ours, no API.
- **Everything is on the user's machine.** Projects, version history and media live in IndexedDB
  under this origin. Anyone with access to the machine or its browser profile can read them. This is
  a property of the design, not a bug.
- **The six stock media API keys are stored in plain form** in IndexedDB. The settings screen says
  so. They are the user's own keys, sent only to the provider they belong to. Encrypting them with a
  key the app must also hold would protect nobody and would make the promise false.
- **The build makes five network requests of its own, and they are enumerated in code.**
  `CCEdition.NETWORK` in `core/edition.js` is the list; `tools/_network-claim-proof.mjs` fails if this
  file, the README, or any other surface disagrees with it. Four go to `app.dika.studio` (sign-in, the
  consent-gated daily beacon, the two panel notices, and the launch update check) and one goes to
  `github.com` (the installer, only after the person accepts an update). None carries a document.
  Three more reach the network only on an explicit action, and never on their own: a stock media
  search using the user's own key, the one-time Whisper model download from huggingface.co, and a
  search in the Lottie panel, which queries graphql.lottiefiles.com because an animation catalogue
  lives on their server and is not a file that could be shipped with this build. Close the panel and
  nothing is sent.
- **Every library this editor loads is inside the package.** It used to fetch six of them (jsPDF,
  pptxgenjs, ExcelJS, Chart.js, bwip-js, ag-psd) plus every emoji image from two public CDNs the
  moment a feature needed one, which made "export to PDF" fail silently with no connection. They are
  vendored now and verified against the hashes that were already pinned in the source. One URL
  remains in the code and cannot be reached: the MediaPipe face-mesh loader, behind an alpha feature
  whose interface is hidden. `tools/_network-claim-proof.mjs` fails if any of that stops being true -
  it reads the shipped bundle, not this file.

## What we do want to hear about

- Anything that makes the build contact a server it should not.
- A path where content in a document (an SVG, a font, an imported `.dikapack`) can run script or read
  files outside the sandbox.
- A way to get an API key out of storage and into somewhere it should not be: the DOM, a log, an
  exported project, a URL.
- Archive handling in the project-package importer (`.dikapack`, and `.ccproj` from earlier builds):
  path traversal, zip bombs, anything that writes outside the destination.
- In the desktop build: anything reachable from the renderer that should have stopped at the preload
  bridge.

## What is out of scope

- "IndexedDB can be read by someone with access to the computer." Yes. See above.
- "The application is not code signed." A decision, documented in the release notes.
- Vulnerabilities in a third-party library that we ship unmodified: report them upstream as well, and
  tell us so we can update the vendored copy.
