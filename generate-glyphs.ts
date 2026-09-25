
// generate-glyphs.ts
//
// Generates SDF glyph range PBFs (MapLibre/Mapbox GL "glyphs" endpoint format)
// from EVERY .ttf file found in ./static.
//
// Usage:
//   npx tsx generate-glyphs.ts
//
// Input:
//   static/*.ttf
//
// Output:
//   glyphs/<Fontstack Name>/<start>-<end>.pbf
//
// Example:
//   static/NotoSans-Italic.ttf
//
// becomes:
//
//   glyphs/Noto Sans Italic/0-255.pbf
//   glyphs/Noto Sans Italic/256-511.pbf
//   ...
//
// The generated directory structure can be served directly as:
//
//   https://your-host/glyphs/{fontstack}/{range}.pbf

import fs from "node:fs";
import path from "node:path";
import fontnik from "fontnik";

const STATIC_DIR = "static";
const OUT_DIR = "glyphs";

const RANGE_SIZE = 256;
const MAX_CODEPOINT = 65535; // Basic Multilingual Plane

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Convert a TTF filename into the fontstack name used by MapLibre.
 *
 * Examples:
 *
 *   Roboto-Regular.ttf       -> Roboto Regular
 *   Roboto-BoldItalic.ttf    -> Roboto Bold Italic
 *   NotoSans-Italic.ttf      -> Noto Sans Italic
 *   NotoSans-Bold.ttf        -> Noto Sans Bold
 *
 * If the filename already contains spaces, those are preserved.
 */
function fontstackFromFilename(filename: string): string {
  let name = path.basename(filename, path.extname(filename));

  // Normalize common separators.
  name = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

  // Insert a space between common camel-case boundaries:
  //
  // NotoSans -> Noto Sans
  // RobotoBold -> Roboto Bold
  // OpenSansItalic -> Open Sans Italic
  name = name.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Normalize common style names.
  const replacements: Array<[RegExp, string]> = [
    [/\bRegular\b/i, "Regular"],
    [/\bItalic\b/i, "Italic"],
    [/\bThin\b/i, "Thin"],
    [/\bExtra Light\b/i, "Extra Light"],
    [/\bExtraLight\b/i, "Extra Light"],
    [/\bLight\b/i, "Light"],
    [/\bMedium\b/i, "Medium"],
    [/\bSemi Bold\b/i, "Semi Bold"],
    [/\bSemiBold\b/i, "Semi Bold"],
    [/\bBold\b/i, "Bold"],
    [/\bExtra Bold\b/i, "Extra Bold"],
    [/\bExtraBold\b/i, "Extra Bold"],
    [/\bBlack\b/i, "Black"],
  ];

  for (const [pattern, replacement] of replacements) {
    name = name.replace(pattern, replacement);
  }

  return name.replace(/\s+/g, " ").trim();
}

/**
 * Find every TTF file in the static directory.
 */
function findTtfFiles(): string[] {
  if (!fs.existsSync(STATIC_DIR)) {
    throw new Error(`Static directory not found: ${STATIC_DIR}`);
  }

  return fs
    .readdirSync(STATIC_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        path.extname(entry.name).toLowerCase() === ".ttf"
    )
    .map((entry) => path.join(STATIC_DIR, entry.name))
    .sort();
}

function genRange(
  fontBuffer: Buffer,
  start: number,
  end: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    fontnik.range(
      {
        font: fontBuffer,
        start,
        end,
      },
      (err: Error | null, pbf: Buffer) => {
        if (err) {
          reject(err);
          return;
        }

        resolve(pbf);
      }
    );
  });
}

async function processFont(
  fontstack: string,
  ttfPath: string
): Promise<number> {
  console.log(`\n→ ${fontstack}`);
  console.log(`  source: ${ttfPath}`);

  const fontBuffer = fs.readFileSync(ttfPath);

  const outDir = path.join(OUT_DIR, fontstack);
  ensureDir(outDir);

  let written = 0;

  for (
    let start = 0;
    start <= MAX_CODEPOINT;
    start += RANGE_SIZE
  ) {
    const end = Math.min(
      start + RANGE_SIZE - 1,
      MAX_CODEPOINT
    );

    try {
      const pbf = await genRange(fontBuffer, start, end);

      const outputPath = path.join(
        outDir,
        `${start}-${end}.pbf`
      );

      fs.writeFileSync(outputPath, pbf);
      written++;

      if (start % 4096 === 0) {
        console.log(`  ${start}-${end}`);
      }
    } catch (err) {
      console.warn(
        `  ! ${fontstack} ${start}-${end}: ${
          err instanceof Error
            ? err.message
            : "Unknown error"
        }`
      );
    }
  }

  console.log(
    `  ✓ ${written} range files -> ${outDir}`
  );

  return written;
}

async function main() {
  ensureDir(OUT_DIR);

  const ttfFiles = findTtfFiles();

  if (ttfFiles.length === 0) {
    console.error(
      `No .ttf files found in ${STATIC_DIR}/`
    );
    process.exit(1);
  }

  console.log(
    `Found ${ttfFiles.length} TTF font${
      ttfFiles.length === 1 ? "" : "s"
    }:\n`
  );

  for (const file of ttfFiles) {
    console.log(
      `  ${path.basename(file)} → ${fontstackFromFilename(
        file
      )}`
    );
  }

  console.log(
    `\nGenerating glyph PBFs for ranges 0-${MAX_CODEPOINT}...\n`
  );

  let totalRanges = 0;

  for (const ttfPath of ttfFiles) {
    const filename = path.basename(ttfPath);
    const fontstack = fontstackFromFilename(filename);

    try {
      totalRanges += await processFont(
        fontstack,
        ttfPath
      );
    } catch (err) {
      console.error(
        `✗ Failed to process ${filename}:`,
        err
      );
    }
  }

  console.log("\n========================================");
  console.log("Done");
  console.log("========================================");
  console.log(`Fonts:  ${ttfFiles.length}`);
  console.log(`Ranges: ${totalRanges}`);
  console.log(`Output: ${OUT_DIR}/`);
  console.log("");
  console.log(
    "Serve the glyphs directory with CORS enabled."
  );
  console.log("");
  console.log(
    'Style glyphs URL:'
  );
  console.log(
    "https://your-host.example.com/glyphs/{fontstack}/{range}.pbf"
  );
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
