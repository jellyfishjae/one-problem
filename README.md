# One Problem

A mobile-first math problem viewer with notes that stay on your device.

## Run locally

```sh
npm install
npm run dev
```

Run `npm run build` for the production PWA and `npm run lint` to check the code. Run `npm run pwa:icons` after changing `public/icon.svg`.

## Public app and private problems

The public build contains only the five original samples in `src/problems.json`. The source PDF, extracted Chapter Zero data, diagrams, and exports live under Git-ignored `books/`; Vite does not include that directory in `dist/`.

To package the local Chapter Zero collection, run:

```sh
npm run export:chapter-zero
```

This writes `books/exports/chapter-zero-import.json`. The script embeds each diagram as a PNG, JPEG, or WebP data URL, so the JSON is self-contained. Keep this file private. Imported collections use `format: "one-problem-collection"`, `version: 1`, and an ordered `problems` array. Each problem has a stable `id`, `chapter`, `number`, and `statement`; `hints` and `solution` are reserved for future use. Inline LaTeX goes between `$` delimiters. A diagram uses `figure.src` (an embedded image data URL), `figure.alt`, and `figure.caption`.

Use **Import JSON** in the app to choose the file. The collection is stored in IndexedDB on that device and remains available offline. The selected problem and notes stay in localStorage, keyed by problem ID. Re-importing with the same IDs preserves those notes and the selected problem.

## Deploy and test on iPhone

1. Run `npm run build`. Deploy only the contents of `dist/` to an HTTPS static host at the root of its origin. Do not upload `books/`, its exports, or the source PDF. Keep the same origin for later updates so local data remains available.
2. Open the public URL in iPhone Safari, use **Share → Add to Home Screen**, then launch One Problem from its icon.
3. Transfer the private export file to the iPhone Files app, for example with AirDrop. In the installed app, tap **Import JSON** and choose that file. Import inside the Home Screen app so the collection is stored in that app's local storage.
4. Open the app once while online, then enable Airplane Mode and reopen it. Check a problem with a diagram, navigation, and a note after reloading.

For desktop offline testing, run `npm run preview` after building and open `http://localhost:4173/`. Wait for the service worker to activate, then switch the browser Network panel to Offline and reload. No backend, account, or cloud storage is used by the app.
