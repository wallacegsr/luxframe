// Prints one version's section of CHANGELOG.md as release notes, which is
// what Home Assistant shows when HACS offers the update.
//
//   node scripts/release-notes.mjs v0.6.0
//
// Wrapped lines are joined, so each paragraph and bullet is one line: some
// renderers, GitHub's release page among them, keep a line break wherever
// the source has one. Fails when the version has no section, so a release
// can't go out without its notes.
import { readFileSync } from 'node:fs';

const version = (process.argv[2] ?? '').replace(/^v/, '');
if (!version) {
  console.error('Usage: node scripts/release-notes.mjs vX.Y.Z');
  process.exit(1);
}

const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split(/\r?\n/);
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
if (start < 0) {
  console.error(`CHANGELOG.md has no section for ${version}.`);
  process.exit(1);
}

const section = [];
for (const line of lines.slice(start + 1)) {
  // The next version, or the links at the foot of the file.
  if (line.startsWith('## ') || /^\[[^\]]+\]: /.test(line)) break;
  section.push(line);
}

const out = [];
let joinable = false;
for (const line of section) {
  const text = line.trim();
  if (!text) {
    out.push('');
    joinable = false;
  } else if (/^(#{1,6} |[-*+] |\d+\. )/.test(text)) {
    out.push(text);
    joinable = !text.startsWith('#');
  } else if (joinable) {
    out[out.length - 1] += ` ${text}`;
  } else {
    out.push(text);
    joinable = true;
  }
}

const notes = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
if (!notes) {
  console.error(`CHANGELOG.md's section for ${version} is empty.`);
  process.exit(1);
}
console.log(notes);
