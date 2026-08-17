// Fails if any colour is set outside the token system.
//
// Widened from the 2A pattern in three ways:
//  - side-specific borders: `border-t-gray-200` in Footer.tsx passed the old
//    grep, which only matched `border-gray-*`
//  - the full neutral scale: gray/slate/zinc/neutral/stone, not just the hues
//  - raw `oklch()` literals, which are token *definitions* wherever they appear
//    and so belong to index.css alone. A literal in a component is a fourth
//    palette that no contrast gate reads and no theme flip reaches.
//
// Run via `npm run lint:colour --workspace @jobportal/web`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

const RULES = [
  {
    // arbitrary hex: bg-[#fff], text-[#123456]
    pattern: /\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/,
  },
  {
    // palette colours, including side-specific borders (border-t-gray-200)
    pattern:
      /\b(?:bg|text|border|ring|fill|stroke)(?:-[trblxyse])?-(?:red|blue|purple|green|yellow|pink|indigo|orange|teal|cyan|gray|grey|slate|zinc|neutral|stone|amber|lime|emerald|sky|violet|fuchsia|rose)-[0-9]{2,3}\b/,
  },
  {
    // bare white/black utilities
    pattern: /\b(?:bg|text|border)(?:-[trblxyse])?-(?:white|black)\b/,
  },
  {
    // raw OKLCH literals outside the token source
    pattern: /oklch\(/,
    // index.css is where the palette is defined; oklch.ts is the runtime parser
    // the ambient shader reads --paper and --signal through, and it necessarily
    // names the function it parses.
    exempt: ["index.css", path.join("lib", "atmosphere", "oklch.ts")],
  },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(tsx?|css)$/.test(entry)) yield full;
  }
}

// ---------------------------------------------------------------- dead classes
// Tailwind only generates `bg-x` if `--color-x` exists in @theme inline. A
// palette token without that alias is invisible: the class is never emitted, no
// build error is raised, and the element simply renders uncoloured.
//
// This shipped twice. `text-warn-text` in LegalDraftNotice.tsx drew an
// uncoloured icon for as long as the file existed, and `bg-shade/60` left the
// dialog scrim fully transparent the moment it was written. Both look like
// working code and read like working code.
//
// The check needs no list of its own: a name declared as a palette token but
// missing from @theme inline is the defect, so the two halves of index.css are
// compared against each other.
const cssSource = readFileSync(path.join(SRC, "index.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

const themed = new Set();
for (const m of cssSource.matchAll(/--color-([\w-]+)\s*:/g)) themed.add(m[1]);

// Palette tokens: colour-valued custom properties that are not themselves
// --color-* aliases. Two passes so a token defined as var() of another is
// recognised regardless of declaration order.
const palette = new Set();
const declarations = [...cssSource.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)]
  .map(([, name, value]) => [name.slice(2), value.trim()])
  .filter(([name]) => !name.startsWith("color-"));
for (let pass = 0; pass < 2; pass++) {
  for (const [name, value] of declarations) {
    const alias = value.match(/^var\(\s*--([\w-]+)\s*\)$/);
    if (/oklch\(|color-mix\(/.test(value) || (alias && palette.has(alias[1]))) {
      palette.add(name);
    }
  }
}

const UTILITY =
  /(?:^|[\s:"'`([])((?:bg|text|border|ring|fill|stroke|outline|divide|decoration|caret|accent|shadow|from|via|to)(?:-[trblxyse])?-([a-z][a-z0-9-]*))(?=[/\s"'`)\]]|$)/g;

let dead = 0;
for (const file of walk(SRC)) {
  const relative = path.relative(SRC, file);
  if (relative === "index.css") continue;
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, i) => {
      for (const [, utility, token] of line.matchAll(UTILITY)) {
        if (!palette.has(token) || themed.has(token)) continue;
        console.log(
          `${relative}:${i + 1}  ${utility} — --${token} is a palette token but has no --color-${token} alias, so Tailwind emits nothing`,
        );
        dead++;
      }
    });
}

// ------------------------------------------------------------- non-token colours
let hits = 0;
for (const file of walk(SRC)) {
  const relative = path.relative(SRC, file);
  const rules = RULES.filter((rule) => !rule.exempt?.includes(relative));
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const { pattern } of rules) {
      const m = pattern.exec(line);
      if (m) {
        console.log(`${relative}:${i + 1}  ${m[0]}`);
        hits++;
        break;
      }
    }
  });
}

if (hits > 0) {
  console.log(`\n${hits} non-token colour(s). Every colour comes from a token utility.`);
}
if (dead > 0) {
  console.log(`\n${dead} dead colour class(es). Add the --color-* alias or use a token that has one.`);
}
if (hits > 0 || dead > 0) process.exit(1);
console.log("No non-token colours, no dead colour classes.");
