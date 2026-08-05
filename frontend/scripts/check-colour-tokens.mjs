// Fails if any colour is set outside the token system.
//
// Widened from the 2A pattern in two ways:
//  - side-specific borders: `border-t-gray-200` in Footer.tsx passed the old
//    grep, which only matched `border-gray-*`
//  - the full neutral scale: gray/slate/zinc/neutral/stone, not just the hues
//
// Run via `npm run lint:colour --workspace @jobportal/web`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

const PATTERNS = [
  // arbitrary hex: bg-[#fff], text-[#123456]
  /\b(?:bg|text|border|ring|fill|stroke)-\[#[0-9a-fA-F]{3,8}\]/,
  // palette colours, including side-specific borders (border-t-gray-200)
  /\b(?:bg|text|border|ring|fill|stroke)(?:-[trblxyse])?-(?:red|blue|purple|green|yellow|pink|indigo|orange|teal|cyan|gray|grey|slate|zinc|neutral|stone|amber|lime|emerald|sky|violet|fuchsia|rose)-[0-9]{2,3}\b/,
  // bare white/black utilities
  /\b(?:bg|text|border)(?:-[trblxyse])?-(?:white|black)\b/,
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(tsx?|css)$/.test(entry)) yield full;
  }
}

let hits = 0;
for (const file of walk(SRC)) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const pattern of PATTERNS) {
      const m = pattern.exec(line);
      if (m) {
        console.log(`${path.relative(SRC, file)}:${i + 1}  ${m[0]}`);
        hits++;
        break;
      }
    }
  });
}

if (hits > 0) {
  console.log(`\n${hits} non-token colour(s). Every colour comes from a token utility.`);
  process.exit(1);
}
console.log("No non-token colours.");
