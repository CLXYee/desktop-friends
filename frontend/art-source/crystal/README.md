# Crystal animation sources

`walking-source.png`, `jumping-source.png`, and `leaving-source.png` are the original supplied sheets, preserved with their painted backgrounds. Runtime sheets in `public/avatars/crystal/` have transparent backgrounds extracted per frame with local macOS Vision, and feet aligned to y=508. The original 4 × 2 grid and artwork scale are preserved.

To reproduce the transparent sheets on macOS 14 or later:

```sh
swift scripts/extract-gesture-sprites.swift /tmp/gesture-sprites art-source/crystal/walking-source.png art-source/crystal/jumping-source.png art-source/crystal/leaving-source.png
```

Copy the resulting `crystal-<animation>-source.png` files to `public/avatars/crystal/<animation>.png` after inspecting them.

Playback follows [Starry’s guideline](../starry/NEW-ANIMATIONS.md): walking loops at 10 fps, jumping plays once at 11 fps to match the coded landing, leaving uses frames 0–4 at 6 fps, and waveGoodbye uses frames 5, 6, 7, 6, 7 at 6 fps. The app supplies movement, the doorway, and effects.
