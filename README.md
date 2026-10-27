# One Problem

A small, mobile-first place to work through one math problem at a time.

## Run locally

```sh
npm install
npm run dev
```

Use `npm run build` to create a production build and `npm run lint` to check the code.

## Problem data

The viewer uses `src/book-problems.json` when it exists locally. It contains the first five problems from Chapter Zero. The source PDF and extracted content are ignored by Git, including the figure in `public/book-assets/`.

If the local book data is absent, the app uses the five original placeholder problems in the tracked `src/problems.json`. Both files use the same ordered format: `id`, `chapter`, `number`, `statement`, `hints`, and `solution`, with an optional `figure`. Inline math in a statement is written between `$` delimiters and rendered with KaTeX. Hints and solutions are reserved for future work and are not displayed.

The app remembers the selected problem and saves notes for each problem by its `id` in browser local storage.
