// generate-glyphs.js
// Rasterizes SDF glyph range PBFs (MapLibre/Mapbox GL "glyphs" endpoint format)
// from a folder of static Roboto TTFs.
//
// Usage: node generate-glyphs.js
//
// Output: glyphs/<Fontstack Name>/<start>-<end>.pbf  for ranges 0-65535

const fs = require('fs');
const path = require('path');
const fontnik = require('fontnik');

// Map: fontstack name (as used in style.json "text-font") -> source TTF path
const FONTS = {
  'Roboto Thin':          'static/Roboto-Thin.ttf',
  'Roboto Thin Italic':   'static/Roboto-ThinItalic.ttf',
  'Roboto Light':         'static/Roboto-Light.ttf',
  'Roboto Light Italic':  'static/Roboto-LightItalic.ttf',
  'Roboto Regular':       'static/Roboto-Regular.ttf',
  'Roboto Italic':        'static/Roboto-RegularItalic.ttf',
  'Roboto Medium':        'static/Roboto-Medium.ttf',
  'Roboto Medium Italic': 'static/Roboto-MediumItalic.ttf',
  'Roboto Bold':          'static/Roboto-Bold.ttf',
  'Roboto Bold Italic':   'static/Roboto-BoldItalic.ttf',
  'Roboto Black':         'static/Roboto-Black.ttf',
  'Roboto Black Italic':  'static/Roboto-BlackItalic.ttf',
};

const OUT_DIR = 'glyphs';
const RANGE_SIZE = 256;
const MAX_CODEPOINT = 65535; // Basic Multilingual Plane; covers Latin/Cyrillic/Greek/etc.

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function genRange(fontBuffer, start, end) {
  return new Promise((resolve, reject) => {
    fontnik.range({ font: fontBuffer, start, end }, (err, pbf) => {
      if (err) return reject(err);
      resolve(pbf);
    });
  });
}

async function processFont(fontstack, ttfPath) {
  const fontBuffer = fs.readFileSync(ttfPath);
  const outDir = path.join(OUT_DIR, fontstack);
  ensureDir(outDir);

  let written = 0;
  for (let start = 0; start <= MAX_CODEPOINT; start += RANGE_SIZE) {
    const end = start + RANGE_SIZE - 1;
    try {
      const pbf = await genRange(fontBuffer, start, end);
      fs.writeFileSync(path.join(outDir, `${start}-${end}.pbf`), pbf);
      written++;
    } catch (err) {
      // Some ranges may legitimately fail if the font has no glyphs in that
      // range at all; fontnik still normally returns an (empty) pbf, so a
      // thrown error here usually means something worth knowing about.
      console.warn(`  ! ${fontstack} ${start}-${end}: ${err.message}`);
    }
  }
  console.log(`✓ ${fontstack}: ${written} range files -> ${outDir}`);
}

async function main() {
  ensureDir(OUT_DIR);
  console.log(`Generating glyph PBFs for ${Object.keys(FONTS).length} fontstacks, ranges 0-${MAX_CODEPOINT} step ${RANGE_SIZE}...\n`);
  for (const [fontstack, ttfPath] of Object.entries(FONTS)) {
    if (!fs.existsSync(ttfPath)) {
      console.warn(`✗ Skipping "${fontstack}": ${ttfPath} not found`);
      continue;
    }
    await processFont(fontstack, ttfPath);
  }
  console.log('\nDone. Upload the glyphs/ directory to a static host with CORS enabled,');
  console.log('then set your style\'s "glyphs" property to:');
  console.log('  https://your-host.example.com/glyphs/{fontstack}/{range}.pbf');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
