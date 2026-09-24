# Self-hosted Roboto glyphs for MapLibre / Mapbox GL

This package contains **ready-to-serve SDF glyph PBFs for Roboto**, generated
directly from Google's official variable font, so your style can use real
Roboto instead of the Noto Sans fallback that `tiles.openfreemap.org` (and
most other public glyph hosts) actually serves.

## What's in here

```
glyphs/                  ← 3,072 files, ~17 MB — UPLOAD THIS FOLDER AS-IS
  Roboto Thin/
  Roboto Thin Italic/
  Roboto Light/
  Roboto Light Italic/
  Roboto Regular/
  Roboto Italic/
  Roboto Medium/
  Roboto Medium Italic/
  Roboto Bold/
  Roboto Bold Italic/
  Roboto Black/
  Roboto Black Italic/
    0-255.pbf
    256-511.pbf
    ...
    65280-65535.pbf      (256 range files per weight/style = full BMP coverage)

static/                  ← the 12 static TTFs instantiated from Google's VF
vf/                       ← the two source variable fonts (upright + italic)
generate-glyphs.js        ← the script that produced glyphs/ — re-run any time
package.json
OFL.txt                   ← official Roboto license (see note below)
```

Each `glyphs/<fontstack>/<range>.pbf` is a pre-rendered signed-distance-field
glyph range, which is exactly the format MapLibre GL / Mapbox GL expects from
a style's `"glyphs"` endpoint.

## 1. Upload `glyphs/` to a static host with CORS enabled

Any static host works — pick whichever you already use:

- **Cloudflare R2 / Pages**, **AWS S3 + CloudFront**, **GitHub Pages**,
  or a static route on your own app server.
- Enable CORS (`Access-Control-Allow-Origin: *`, or your domain) — MapLibre
  fails to load glyphs silently if this is missing, you'll just see blank
  labels with no console error pointing at the cause.
- Set long-lived cache headers (`Cache-Control: public, max-age=31536000,
  immutable`) — these files never change once generated.

Example with the AWS CLI:

```bash
aws s3 sync glyphs/ s3://your-bucket/glyphs/ \
  --cache-control "public,max-age=31536000,immutable"
# then set the bucket/CloudFront distribution's CORS policy to allow your origin
```

## 2. Point your style at it

```json
{
  "glyphs": "https://your-host.example.com/glyphs/{fontstack}/{range}.pbf"
}
```

And in any symbol layer:

```json
"layout": {
  "text-font": ["Roboto Regular"]
}
```

Valid fontstack names are exactly the folder names above, e.g.
`"Roboto Bold"`, `"Roboto Medium Italic"`, `"Roboto Black"`.

## 3. Update the panel note

Since this fixes the underlying caveat from before, you can drop the
"falls back to Noto Sans" note in your font-picker UI and list the Roboto
weights above directly.

## Regenerating or extending

`generate-glyphs.js` re-derives everything from `static/*.ttf`. To add a
weight/style, or to swap in your own hinted/hand-tuned TTFs:

```bash
npm install
node generate-glyphs.js
```

To go past the Basic Multilingual Plane (codepoints > 65535 — rarely needed
for map labels, mostly emoji/rare scripts), edit `MAX_CODEPOINT` in the
script.

The `static/*.ttf` files were produced from Google's official variable fonts
(`vf/Roboto-VF.ttf`, `vf/Roboto-Italic-VF.ttf`, pulled from
`google/fonts/ofl/roboto`) using `fonttools varLib.instancer`, e.g.:

```bash
fonttools varLib.instancer -o static/Roboto-Bold.ttf vf/Roboto-VF.ttf wght=700 wdth=100
```

Available weights on the axis: `wght` 100–900 (Thin→Black), `wdth` fixed at
100 (Roboto only ships Normal width statics upstream).

## License correction

One correction to flag from the earlier note: Roboto is **not** Apache 2.0
anymore. As of the "Roboto Classic" v3 update (2020), Google relicensed it
under the **SIL Open Font License 1.1** (`OFL.txt`, included here), and moved
it from the `apache/` to the `ofl/` directory of the `google/fonts` repo.
OFL permits embedding, redistribution, and self-hosting freely (including
bundling in an app or serving from your own infrastructure) — it just
restricts selling the font *by itself* and requires the license text travel
with the font. Keep `OFL.txt` alongside wherever you redistribute the TTFs
or glyph PBFs.
