// Refresh Know Your Ballot's copy of govbot's site shell (header, drawer,
// footer, stylesheet and their script) from chihacknight/govbot, so the
// page looks and behaves like the rest of govbot. Run: node scripts/ballot/govbot-shell.mjs
import { writeFileSync } from 'node:fs';

const RAW = 'https://raw.githubusercontent.com/chihacknight/govbot/main/docs/';
const FILES = {
  'header.html': 'theme/header.html',
  'footer.html': 'theme/footer.html',
  'govbot.css': 'src/dashboard/assets/govbot.css',
  'govbot-shell.js': 'src/dashboard/assets/govbot-shell.js',
};

for (const [name, path] of Object.entries(FILES)) {
  const res = await fetch(RAW + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  writeFileSync(new URL(`../../src/projects/ballot/govbot/${name}`, import.meta.url), await res.text());
  console.log('updated', name);
}
