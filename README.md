# One Problem

A small, mobile-first place to work through one math problem at a time. This first milestone uses five original placeholder problems; it does not contain content from *Mathematical Circles (Russian Experience)*.

## Run locally

```sh
npm install
npm run dev
```

Use `npm run build` to create a production build and `npm run lint` to check the code.

Problems live in `src/problems.json` in reading order. The app remembers the selected problem and saves notes for each problem by its `id` in browser local storage.
