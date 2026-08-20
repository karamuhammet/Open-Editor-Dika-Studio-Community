# Contributing

Thanks for looking. A few things are worth knowing before you spend time on a change.

## The contributor licence agreement

This project is dual-tracked: the Community Editor is BUSL-1.1, and Dika Design Ltd also ships a hosted
product built from a shared codebase. For that to keep working, contributions need a **CLA**
(a contributor licence agreement) before they can be merged.

**Practically:** you keep the copyright in your work, and you grant Dika Design Ltd the right to use it
under both this repository's licence and the hosted product's licence. You are not signing your work away, and it
stays under the BUSL-1.1 for everyone who receives it here.

If a CLA is not in place for your account yet, the maintainers will point you at it on your first
pull request. Nothing is merged without it, and that is not a judgement about the change: without a
CLA the project loses the ability to relicense its own code, and that cannot be undone afterwards
without contacting every contributor who ever landed a line.

## Before you open a pull request

1. **Run the checks.** All three must pass:
   ```bash
   node tools/check-upstream-drift.mjs
   ```
   ```bash
   node tools/build-bundle.mjs
   ```
   ```bash
   node tools/_file-proof.mjs
   ```
2. **Rebuild the bundle** if you touched anything under `modules/`, `core/` or `js/`. `index.html` is
   generated; editing it by hand is always wrong.
3. **Edit `index.dev.html`**, never `index.html`.
4. **Record your change in `tools/fork-manifest.json`** with a reason in words, if it makes this tree
   differ from upstream in a new way. The drift checker fails on an unrecorded difference and on a
   record that no longer applies.

## House rules that are not style preferences

- **This build makes no network request of its own.** If your change adds one, it needs a very good
  reason, it has to be disclosed in the README and in the setup wizard, and it has to be off by
  default. The zero-request assertion in `tools/_file-proof.mjs` is a test, not an aspiration.
- **No ghost UI.** If a surface renders, it must work, or it must explain why it cannot. There is
  exactly one written exception: the three ad surfaces (AI panel, Products panel, share tiles), which
  render a card that says what the feature is and that it needs an account.
- **Nothing is stored in `localStorage`.** The quota is 5 MB and it was measured full on a real
  machine. Everything goes through `CCIdb` / `CCLocalStore`.
- **The editor is vanilla ES5**: `var`, function declarations, no modules, two-space indent, single
  quotes. It has no bundler for `core/` and `js/`, and no TypeScript or ESLint. "Verified" means
  `node --check` plus running it and reading the console.
- **No em-dash** anywhere: code, comments, UI text or docs.

## Reporting a bug

There is no in-app feedback form, on purpose: it would be a network request. Use the issue tracker,
and please say which build (file, static server, or desktop) and which browser.

## Security

See [SECURITY.md](SECURITY.md). Do not open a public issue for a vulnerability.
