#!/usr/bin/env node
// Turns a Claude Design export into the plain static site in this repo.
//
//   node tools/unbundle.mjs ~/Downloads/"Readr Landing Page.html" .
//
// The export is a single HTML file that carries the real page as a JSON-escaped
// string in <script type="__bundler/template">, with every image and font stashed
// as base64 in a sibling manifest and referenced by UUID. Browsers only render it
// because an inline script unpacks the manifest into blob URLs at load time —
// useless for a hosted site. This writes the assets out as files, rewrites the
// UUID references to real paths, and reapplies the handful of patches this site
// needs on top of a raw export.
//
// Every patch is asserted. If an export changes shape, this exits non-zero rather
// than shipping a half-rewritten page.

import fs from 'node:fs';
import path from 'node:path';

const [, , SRC, DEST = '.'] = process.argv;
if (!SRC) {
  console.error('usage: node tools/unbundle.mjs <export.html> [dest-dir]');
  process.exit(2);
}

const SITE_URL = 'https://readr-ai.github.io/';
const GFORM =
  'https://docs.google.com/forms/d/e/1FAIpQLSeE4bfzCrOYfQBlqu_1VQu4oVg5S2VIpxCWmAbvZqi1rhQm5g/viewform';
const GFORM_EMAIL_ENTRY = 'entry.2046830010';

const die = (msg) => {
  console.error('unbundle: ' + msg);
  process.exit(1);
};

const raw = fs.readFileSync(SRC, 'utf8');
const block = (type) => {
  const m = raw.match(
    new RegExp('<script type="__bundler/' + type + '">\\s*([\\s\\S]*?)\\s*<\\/script>')
  );
  if (!m) die(`no __bundler/${type} block — is this a Claude Design export?`);
  return m[1];
};

let html = JSON.parse(block('template'));
const manifest = JSON.parse(block('manifest'));
const external = JSON.parse(block('ext_resources'));
if (external.length) die(`export pulls in external resources: ${JSON.stringify(external)}`);

fs.mkdirSync(path.join(DEST, 'assets/fonts'), { recursive: true });

// Name each woff2 from the subset comment and font-style above its @font-face,
// so assets/fonts/ is readable instead of a wall of UUIDs.
const fontNames = {};
for (const [, subset, body] of html.matchAll(/\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)) {
  const style = (body.match(/font-style:\s*([a-z]+)/) ?? [, 'normal'])[1];
  const uuid = (body.match(/url\("([^"]+)"\)/) ?? [])[1];
  if (uuid) fontNames[uuid] = `literata-${style}-${subset}.woff2`;
}

for (const [uuid, asset] of Object.entries(manifest)) {
  if (asset.compressed) die(`asset ${uuid} is compressed; this script only handles raw base64`);
  let rel;
  if (asset.mime === 'font/woff2') rel = 'assets/fonts/' + (fontNames[uuid] ?? `${uuid}.woff2`);
  else if (asset.mime === 'image/jpeg') rel = 'assets/hero.jpg';
  else die(`unhandled asset type ${asset.mime} (${uuid}) — add a mapping for it`);

  if (!html.includes(uuid)) die(`asset ${uuid} is in the manifest but never referenced`);
  fs.writeFileSync(path.join(DEST, rel), Buffer.from(asset.data, 'base64'));
  html = html.split(uuid).join(rel);
}

// --- Head: fonts are self-hosted, so the Google Fonts preconnects are dead weight.
// Everything the export has no way to know about (icon, canonical, social cards)
// goes in their place.
html = html.replace(
  /<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\n<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin="">\n/,
  `<link rel="icon" href="assets/icon.png" type="image/png">
<link rel="apple-touch-icon" href="assets/icon.png">
<link rel="canonical" href="${SITE_URL}">
<meta property="og:type" content="website">
<meta property="og:title" content="Readr — for the love of reading">
<meta property="og:description" content="Readr is the ebook reader you can ask questions. Ask in the margin, get a cited answer, keep reading.">
<meta property="og:url" content="${SITE_URL}">
<meta property="og:image" content="${SITE_URL}assets/hero.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="assets/fonts/literata-normal-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/literata-italic-latin.woff2" as="font" type="font/woff2" crossorigin>
`
);

// --- Hero: real dimensions so the page does not reflow when the photo lands.
html = html.replace(
  '<img src="assets/hero.jpg" alt=""',
  '<img src="assets/hero.jpg" alt="" width="1600" height="1100" decoding="async" fetchpriority="high"'
);

// --- Waitlist layout: the export sizes the email input `width: min(280px, 100%)`
// and leaves the form at fit-content inside a centred flex column. The `100%` has
// nothing to resolve against during intrinsic sizing, so the form gets measured
// against the placeholder text (~377px) rather than the input's real 280px — then
// the input lays out at 280px, no longer fits beside the 157px button, and the
// button wraps onto its own line. A definite width takes the form off intrinsic
// sizing; the row still centres, and the ≤700px rule still stacks it.
const waitlistRule =
  '.waitlist { margin-top: 34px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }';
if (!html.includes(waitlistRule)) die('.waitlist rule not found — has the design changed?');
html = html.replace(
  waitlistRule,
  '.waitlist { margin-top: 34px; display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; width: 100%; }'
);

// --- The privacy notice is a page on this site; link it from the footer.
html = html.replace(
  '      <a href="https://github.com/readr-ai/readr/blob/main/LICENSE">MIT License</a>\n',
  '      <a href="privacy.html">Privacy</a>\n      <a href="https://github.com/readr-ai/readr/blob/main/LICENSE">MIT License</a>\n'
);

// --- Waitlist: the export ships a cosmetic form whose submit handler only rewrites
// its own button text, so a visitor is told they signed up while nothing is
// recorded. Point both forms at the real Google Form with the email prefilled.
// Plain HTML GET, so it works with JavaScript disabled.
const formOpen = '<form class="waitlist" onsubmit="return joinWaitlist(this)">';
const formCount = html.split(formOpen).length - 1;
if (formCount !== 2) die(`expected 2 waitlist forms, found ${formCount}`);
html = html
  .split(formOpen)
  .join(
    `<form class="waitlist" action="${GFORM}" method="get" target="_blank" rel="noopener">\n        <input type="hidden" name="usp" value="pp_url">`
  );

const emailInput =
  '<input type="email" required="" placeholder="you@example.com" aria-label="Email address">';
if (!html.includes(emailInput)) die('waitlist email input not found');
html = html
  .split(emailInput)
  .join(
    `<input type="email" name="${GFORM_EMAIL_ENTRY}" required="" placeholder="you@example.com" aria-label="Email address">`
  );

// Drop the now-dead handler rather than leave a misleading stub in the source.
const stub = html.match(/\n  \/\/ Waitlist \(no backend yet\): acknowledge in place\.\n[\s\S]*?\n  \};\n/);
if (!stub) die('could not find the joinWaitlist stub to remove');
html = html.replace(stub[0], '\n');

// --- Nothing half-applied, nothing left pointing at a blob URL.
for (const needle of ['og:image', 'fetchpriority="high"', 'href="privacy.html"', GFORM_EMAIL_ENTRY]) {
  if (!html.includes(needle)) die(`patch did not apply: ${needle}`);
}
if (html.includes('joinWaitlist')) die('joinWaitlist reference survived');
if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(html))
  die('a bundler UUID survived in the output');

fs.writeFileSync(path.join(DEST, 'index.html'), html);
console.log(`wrote index.html (${html.length} bytes) and ${Object.keys(manifest).length} assets`);
