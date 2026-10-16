# Starry: new animation sheets

Starry has two gestures whose motion comes from code: taking a break (she walks out through a door that slams) and the star jump when you click her. Each one also has sprite sheets for her body pose:

| File (in `public/avatars/starry/`) | Used for | Plays |
|---|---|---|
| `walking.png` | Hopping to and from the door when she takes a break | Loops at 10 fps |
| `jumping.png` | The star jump when you click her | Once at 12 fps |
| `leaving.png` | Getting up after studying too long (poses 1–5), then turning around and waving goodbye at the door (poses 6–8) | Once at 6 fps |

**Current art:** all three sheets were packed from `gestures-source.jpg` (in this folder: 3 rows of 8 poses on green) with:

```sh
npm run sprites:pack -- starry walking art-source/starry/gestures-source.jpg --row 1
npm run sprites:pack -- starry jumping art-source/starry/gestures-source.jpg --row 2 --reference-frame 7
npm run sprites:pack -- starry leaving art-source/starry/gestures-source.jpg --row 3 --reference-frame 1
```

`leaving.png` is split into two clips in `animations.json`: `leaving` (frames 0–4, played at her spot) and `waveGoodbye` (frames 5–7, played at the doorway). Packing `leaving` again resets its frames to all 8, so set `leaving` back to `[0, 1, 2, 3, 4]` afterwards. `jumping` runs at 11 fps so the drawn landing lines up with the code's landing.

`make-placeholders.mjs` builds stand-in sheets from her waving frames for any slot without art. It never overwrites real art unless you pass `--force`.

The code still moves her (the hop, the jump height, the walk to the door) and draws the door, the "BAM!", the sign and the stars. The new art only needs to show her body pose.

## Making real poses

### 1. Generate the poses

Her existing art looks AI-generated, so an image generator that accepts a reference image gives the closest match (for example ChatGPT, Gemini or Midjourney).

- Attach **`art-source/starry/reference.png`** (this folder) so the tool keeps her design. To recreate the file, run `npm run sprites:pack -- starry --reference`.
- Ask for a **transparent background**. If the tool can't do that, ask for a **solid pure green (#00ff00) background**. Avoid white: her shirt and socks are white, so white background trapped in gaps (between hair strands, for example) can't be told apart from her clothes.
- One image with up to 8 poses is fine, and so are separate images (one per pose). The packer finds the poses itself, even if they're unevenly spaced.

Paste one of these prompts, with the reference image attached:

> **walking**: Using the attached character as an exact reference (same face, hair, outfit, colors and soft painterly chibi style), draw 8 animation frames of her doing a bouncy, happy walk cycle in a ¾ view facing right. Frames 1–4 are one step and 5–8 the other; arms swing and the ponytail bounces. Full body, same size in every frame, evenly spaced in one image, on a transparent background (or a solid #00ff00 green background). No text, no shadows on the ground.

> **jumping**: Using the attached character as an exact reference (same face, hair, outfit, colors and soft painterly chibi style), draw 8 animation frames of a joyful jump, each drawn in place: 1 small crouch, 2 deeper crouch with arms back, 3 take-off stretching up with arms rising, 4 airborne with both arms up and happy closed eyes, 5 peak with legs tucked and ponytail flying up, 6 coming down with arms out, 7 landing crouch, 8 standing and smiling. Full body, same size in every frame, evenly spaced in one image, on a transparent background (or a solid #00ff00 green background). No text.

> **leaving**: Using the attached character as an exact reference (same face, hair, outfit, colors and soft painterly chibi style), draw 8 animation frames, no furniture: 1–2 rising from sitting to standing, 3–4 a big stretch with both arms overhead and a yawn, 5 a small pouty "hmph" with puffed cheeks, 6 turning slightly to the right, 7–8 a quick goodbye wave over her shoulder. Full body, same size in every frame, evenly spaced in one image, on a transparent background (or a solid #00ff00 green background). No text.

Generators often drift on details (hair clip, number of stars, shoe colors). Regenerate until the outfit matches the reference; consistency across frames matters more than any single frame.

### 2. Pack them into her sheet

From the project folder:

```sh
npm run sprites:pack -- starry walking path/to/walking.png
npm run sprites:pack -- starry jumping path/to/jumping.png --fps 12
npm run sprites:pack -- starry leaving pose1.png pose2.png pose3.png   # separate images also work
npm run sprites:pack -- starry walking all-poses.png --row 1            # one row of a multi-row sheet
```

The packer:

- removes a plain, checkerboard or green background
- finds each pose, in reading order (left to right, top row first)
- scales all poses together to her existing height, with her feet on the same baseline and her body centered like in `waving.png`
- writes the 1536 × 1024 sheet into `public/avatars/starry/`, and updates `animations.json` (frame count, plus `--fps` if given)
- saves your original image here, in `art-source/starry/`

If the poses come out the wrong size (for example the image starts with a crouch), add `--reference-frame N` to scale from pose N (counting from 0), which should be a normal standing pose. If it warns about background pixels left inside the character, generate again with a transparent or green background.

### 3. Look at it

Restart the app (`npm start`, or rebuild with `npm run package`), then:

- **Jumping:** click Starry.
- **Walking and leaving:** set the routine card to "After 1 min studying" so she takes a break soon.

To go back to placeholders, run `node art-source/starry/make-placeholders.mjs --force`.

## Sheet format (if you draw by hand)

- PNG, **1536 × 1024**, transparent background.
- 4 columns × 2 rows of **384 × 512** frames, read left to right, top row first.
- Same scale as `waving.png`: her feet about 3 px above the bottom of each frame, and her body horizontally centered.
- Draw her in place. Don't move her up for the jump or across the frame for the walk; the code does that.

## Character notes

Match `waving.png` and `studying.png`:

- Chibi proportions (big head, small body), soft painterly shading, warm golden glow.
- Bright yellow messy hair with a high side ponytail on the right side of the image, an ahoge (stray strand) on top, and a yellow star hair clip.
- Big amber-gold eyes and rosy cheeks.
- Yellow varsity jacket with cream sleeves and striped cuffs, over a white t-shirt with a big yellow star.
- Yellow shorts with white side stripes, white socks, and yellow-and-white high-top sneakers with stars.
