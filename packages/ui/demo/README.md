# Demo recording

Records a short video and a handful of screenshots of the app's core flow
(load example → compare → tree view → source view → analysis panel), for use
in the README or marketing materials. This is **not** part of the E2E test
suite (`packages/ui/e2e/`) — it's a standalone script, not run in CI.

## Prerequisites

The Angular dev server must already be running before you record. In one
terminal, from `packages/ui`:

```bash
npm run start
```

## Recording

In another terminal, from `packages/ui`:

```bash
npm run demo:record
```

By default the browser runs headed so you can watch it record. To run
headless instead:

```bash
HEADLESS=1 npm run demo:record
```

## Output

- `demo/output/video/*.webm` — the recorded session
- `demo/output/screenshots/*.png` — 5 screenshots (empty state, filled
  editors, tree result, source view, analysis panel)

These are build artifacts and are gitignored — pick, crop, or convert the
asset you want and commit it elsewhere (e.g. a `docs/` folder) if needed.

## Converting the video to a GIF

GitHub markdown does **not** autoplay inline `<video>`/mp4 embeds, but it
**does** autoplay GIFs — so GIF is the recommended format for embedding the
demo in a README.

Using `ffmpeg`:

```bash
ffmpeg -i demo/output/video/<file>.webm -vf "fps=12,scale=1280:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 demo/output/demo.gif
```

Alternatively, [`gifski`](https://github.com/ImageOptim/gifski) tends to
produce better quality at a smaller file size, if you have it installed:

```bash
gifski --fps 12 -o demo/output/demo.gif demo/output/video/<file>.webm
```
