# One Problem

A small, mobile-first place to work through one math problem at a time.

## Run locally

```sh
npm install
npm run dev
```

Use `npm run build` to create a production build and `npm run lint` to check the code.

## Offline app

The production build includes a web app manifest and a service worker. It precaches the app shell, KaTeX assets, icons, and any locally bundled problem diagram. The book problems are bundled into the JavaScript when `src/book-problems.json` exists. Notes and the selected problem remain in browser local storage. Run `npm run pwa:icons` after changing `public/icon.svg` to regenerate the Home Screen icons.

To test offline locally:

1. Run `npm run build`, then `npm run preview`.
2. Open `http://localhost:4173/` in a browser and wait for the service worker to activate. In browser developer tools, check the Service Workers and Cache Storage panels.
3. In the Network panel, switch to Offline and reload. Navigate to Problem 4 and check that Figure 1 appears. Write a note, reload again, and check that the note and selected problem persist.

Service workers require a secure context. `localhost` works for local desktop testing; an iPhone needs an HTTPS origin to test Home Screen installation and offline use. On iPhone, add the site to the Home Screen in Safari, open it once while online, then enable Airplane Mode and reopen it. This repository does not deploy the app or share the local book files.

## Problem data

The viewer uses `src/book-problems.json` when it exists locally. It contains the first five problems from Chapter Zero. The source PDF and extracted content are ignored by Git, including the figure in `public/book-assets/`.

If the local book data is absent, the app uses the five original placeholder problems in the tracked `src/problems.json`. Both files use the same ordered format: `id`, `chapter`, `number`, `statement`, `hints`, and `solution`, with an optional `figure`. Inline math in a statement is written between `$` delimiters and rendered with KaTeX. Hints and solutions are reserved for future work and are not displayed.

The app remembers the selected problem and saves notes for each problem by its `id` in browser local storage.
