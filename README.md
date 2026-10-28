# One Problem

A mobile-first math problem viewer with notes that stay on your device.

## Run locally

```sh
npm install
npm run dev
```

Run `npm test` for the library and migration tests, `npm run build` for the production PWA, and `npm run lint` to check the code. Run `npm run pwa:icons` after changing `public/icon.svg`.

## Public app and private problems

The public build contains only the five original samples in `src/problems.json`. The source PDF, extracted Chapter Zero data, diagrams, and exports live under Git-ignored `books/`; Vite does not include that directory in `dist/`.

To package the local Chapter Zero collection, run:

```sh
npm run export:chapter-zero
```

This writes `books/exports/chapter-zero-import.json` with all 25 Chapter Zero problems. The script embeds each diagram as a PNG, JPEG, or WebP data URL, rasterizing the private SVG sources as needed, so the JSON is self-contained. Keep this file private. Imported collections use `format: "one-problem-collection"`, `version: 1`, and an ordered `problems` array. Each problem has a stable `id`, `chapter`, `number`, and `statement`; `hints` and `solution` are reserved for future use. Inline LaTeX goes between `$` delimiters. A diagram uses `figure.src` (an embedded image data URL), `figure.alt`, and `figure.caption`.

For PDF extraction and the private Chapter 1 collection, see [the extraction guide](docs/extraction-pipeline.md). The generated import and review files remain under ignored `books/`.

Use **Import JSON** in the app to choose either Chapter Zero or Chapter 1. Each version 1 JSON import merges into the local IndexedDB library. Re-importing updates problems with the same IDs and leaves other chapters in place. The chapter selector beside the heading shows only imported chapters, with their problem counts. Previous and Next stay within the selected chapter.

The database upgrades from version 1 to version 2 by adding a `library` store. On the first load or import after upgrading, the app copies the old `collections/active` collection into the new library and keeps the old record untouched. Each import validates the file first, then merges and saves in one IndexedDB transaction. If an import fails, the existing library remains intact. Notes keep their existing `one-problem:notes:<id>` localStorage keys. The old `one-problem:current-problem` key is read during migration; the app also saves the active chapter and each chapter's last problem in localStorage.

## Deploy and test on iPhone

1. Run `npm run build`. Deploy only the contents of `dist/` to an HTTPS static host at the root of its origin. Do not upload `books/`, its exports, or the source PDF. Keep the same origin for later updates so local data remains available.
2. Open the public URL in iPhone Safari, use **Share → Add to Home Screen**, then launch One Problem from its icon.
3. Transfer each private export file to the iPhone Files app, for example with AirDrop. In the installed app, tap **Import JSON** for Chapter Zero and then Chapter 1. Import inside the Home Screen app so the library is stored in that app's local storage.
4. Open the app once while online, then enable Airplane Mode and reopen it. Check the chapter selector, a problem with a diagram in each chapter, per-chapter navigation, and a note after reloading.

For desktop offline testing, run `npm run preview` after building and open `http://localhost:4173/`. Wait for the service worker to activate, then switch the browser Network panel to Offline and reload. No backend, account, or cloud storage is used by the app.
