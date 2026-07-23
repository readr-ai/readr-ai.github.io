# readr-ai.github.io

The Readr website. Static, no build step, no dependencies.

**Live at <https://readr-ai.github.io/>**

| Page | File |
| --- | --- |
| Landing page | [`index.html`](index.html) |
| Privacy notice | [`privacy.html`](privacy.html) |

The privacy notice lives here (it used to sit in `site/` in the app repo,
`readr-ai/readr`). It is the canonical URL to point the App Store / TestFlight
listing at: <https://readr-ai.github.io/privacy.html>

## Layout

```
index.html            landing page — all CSS and JS inline, self-contained
privacy.html          privacy notice — self-contained
assets/hero.jpg       hero photograph
assets/icon.png       favicon / apple-touch-icon
assets/fonts/*.woff2  Literata (SIL Open Font License), self-hosted
.nojekyll             serve files as-is, no Jekyll processing
tools/unbundle.mjs    regenerates index.html from a Claude Design export
```

Fonts are self-hosted rather than pulled from Google Fonts, so the site makes no
third-party requests at all.

## Deploying

GitHub Pages serves the `main` branch root. **Push to `main` and it is live** —
usually within a minute. There is no workflow to wait on.

## Editing

`index.html` is a normal HTML file — edit it directly for copy and markup
changes.

If the design is reworked in Claude Design, export the page and re-run the
unbundler instead of hand-merging:

```bash
node tools/unbundle.mjs ~/Downloads/"Readr Landing Page.html" .
```

It unpacks the export's base64 asset manifest into `assets/`, rewrites the UUID
references to real paths, and reapplies the changes this site needs on top of a
raw export:

- self-hosted font and image paths in place of bundler UUIDs
- favicon, canonical URL, and Open Graph / Twitter card tags
- explicit hero dimensions (no layout shift on load)
- footer link to the privacy notice
- the waitlist forms wired to the Google Form (see below)

The script fails loudly if any of those patches no longer match, so a changed
export cannot silently ship half-applied.

## Waitlist

Both waitlist forms `GET` to a Google Form, prefilling the email field:

```
https://docs.google.com/forms/d/e/1FAIpQLSeE.../viewform?usp=pp_url&entry.2046830010=<email>
```

The visitor lands on the form with their address filled in and confirms there.
It is plain HTML, so it works with JavaScript disabled. To swap in a different
form, change `GFORM` and `GFORM_EMAIL_ENTRY` in `tools/unbundle.mjs` (find the
new field id by loading the form and reading its `entry.NNNN` parameter), or
edit the two `<form class="waitlist">` tags in `index.html` directly.

## Licence

Site content © the Readr project. Readr itself is
[MIT licensed](https://github.com/readr-ai/readr/blob/main/LICENSE).
Literata is used under the SIL Open Font License.
