# Building the desktop app

```bash
npm install
npm start          # run it from source
```

Then, from THIS directory (electron-builder lives in `apps/community-desktop/node_modules`, not at
the repo root, and running it from the root fails with `npx canceled due to missing packages`):

```bash
npx --no-install electron-builder --win nsis
```

PowerShell 5.1 has no `&&`, so chain with `;` if you need to change directory in the same line.

## State, measured 2026-08-15 on this Windows machine

| Target | Result | Why |
|---|---|---|
| **Windows nsis** | **works.** `dist/dika Setup 1.0.0.exe`, 173 MB, unsigned | |
| **Linux tar.gz** | **works.** `dist/cardcraft-community-desktop-1.0.0.tar.gz`, 198 MB | extract, run `./dika` |
| Linux AppImage | cannot be built here | `mksquashfs` is shipped only as a Linux ELF binary |
| Linux deb | cannot be built here | needs `fpm` (a Ruby packaging tool) on PATH |
| macOS dmg / zip | cannot be built here | electron-builder refuses: *"Build for macOS is supported only on macOS"* |

**The three that cannot be built here are not configuration mistakes**, and the application itself
packages fine either way: `dist/linux-unpacked` is produced complete before the wrapper step fails.
`.github/workflows/community-desktop.yml` builds all three on GitHub's own runners
(ubuntu-latest / macos-latest / windows-latest). It is **manual dispatch only**: a 200 MB
three-platform build on every commit is minutes of CI and gigabytes of artifacts nobody asked for.

A `tar.gz` is a real way to ship Linux, not a consolation prize: extract it and run the binary. Use
it while nobody has run the workflow.

### Pointing a build at a different server

```bash
"dist/win-unpacked/dika.exe" --api-base=http://localhost:3000
```

`CC_API_BASE` does the same. Only http and https are accepted, and the ONE overridden origin is
added to the shell's `connect-src` / `img-src` / `media-src`, never `http:` as a scheme. Without this
the registration wizard cannot reach a local server: the CSP allows `https:` only, so the fetch never
leaves the renderer and the app falls back to its built-in screen, which reads exactly like "the
server has nothing published".

The packaged Windows app is proven by `_packaged-proof.mjs`, which drives the built
`dist/win-unpacked` exe rather than the development tree: `app://editor`, `crossOriginIsolated: true`,
local `fetch` works so the on-device models load, `nodeLeaked: false`, seven bridge methods and no
generic invoke, zero cross-origin requests, and `index.dev.html` and `tools/` correctly 404 because
they are excluded from the package.

## Why AppImage fails here, precisely

Two different walls, in order. Do not confuse them:

1. **Symlink privilege.** Both targets used to fail with "a required privilege is not held by the
   client": the AppImage icon step, and the Windows build while 7-Zip extracted electron-builder's
   own `winCodeSign` toolchain, which contains macOS `.dylib` symlinks.
   **Turning on Developer Mode is not enough on its own.** Measured: `AllowDevelopmentWithoutDevLicense`
   read `1` while `whoami /priv` showed no `SeCreateSymbolicLinkPrivilege` at all, because the
   privilege is added to the token AT LOGON. A new terminal inherits the old token. Sign out and back
   in, or run the build from an elevated shell.
2. **`mksquashfs` is a Linux binary.** With the privilege granted, AppImage gets one step further and
   then dies on
   `exec: "...\appimage-12.0.1\linux-x64\mksquashfs": file does not exist`.
   The file IS there, 270 KB. It is an ELF binary with no extension, and Windows will not execute it,
   so Go's `exec` reports it as missing. This is a hard limit, not a configuration mistake: AppImage
   and deb need WSL, Docker or a Linux machine. Neither WSL nor Docker is installed here.

## Windows hosts need one setting turned on first

Measured on this machine, and it is worth knowing before you lose an hour to it: **both** the Linux
AppImage and the Windows NSIS build fail at the same point on Windows, with the same error:

```
ERROR: Cannot create symbolic link : a required privilege is not held by the client
```

- The AppImage build fails creating the icon symlink under `dist/__appImage-x64/`.
- The Windows build fails earlier, while 7-Zip extracts electron-builder's own `winCodeSign`
  toolchain, which contains macOS `.dylib` symlinks.

Neither is a problem with this app or its configuration. **The application itself packages fine**:
`dist/linux-unpacked` was produced complete, 422 MB, with `resources/editor` carrying the whole
editor tree. Only the wrapper steps need the privilege.

Fixes, in order of least effort:

1. **Enable Windows Developer Mode** (Settings > Privacy and security > For developers). This grants
   symlink creation without elevation and is the normal fix.
2. Run the build from an elevated shell.
3. Build on Linux or in CI, which is where release builds should be made anyway.

## Signing

Nothing is signed and no certificate is configured. Linux AppImage and deb are normally distributed
unsigned. Windows will show SmartScreen and macOS will show Gatekeeper warnings until somebody buys a
certificate and, for macOS, notarises the build. That is a decision, not an oversight; see
`docs/community-edition-release-plan.md` D5.

## The Windows installer needs two generated files

Both live in `build/` and both are inputs to the NSIS build, so regenerate them after touching their
sources and before packaging:

```bash
node build/make-wizard-art.mjs        # wizard-mark.bmp, the dika mark on the installer's own background
node build/make-progress-helper.mjs   # ccprogress.exe, from build/progress-helper.nsi
```

`ccprogress.exe` is the installer's progress reporter and runs as a **separate process** while the
copy is going. It cannot be part of the installer: polling the progress bar from inside NSIS executes
instructions on the UI thread while the install thread is executing the section, which corrupts shared
state and crashes the installer. The head of `build/progress-helper.nsi` carries the whole story and
the control ids the two scripts agree on. It is compiled by the makensis electron-builder already
downloaded; set `NSIS_MAKENSIS` to use a different one.

## Icon

`electron-builder` currently reports "default Electron icon is used". Put a 512x512 `icon.png` (and
`icon.ico` for Windows) in `build/` before a release.

## What ends up in the package

The editor ships as an **unpacked resource** (`resources/editor`), not inside an asar: the renderer
reads the ONNX weights and wasm runtimes at runtime. `tools/`, `tests/`, `scripts/`, `index.dev.html`
and `package.json` are excluded, because nothing reads them at runtime and the protocol handler will
serve anything inside the tree.
