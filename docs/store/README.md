# Store submissions

One sheet per store, ready to copy into the submission form.

| File | Store | Fee | Notes |
|---|---|---|---|
| [chrome.md](chrome.md) | Chrome Web Store | 5 USD once | The main listing. Brave installs from here too |
| [edge.md](edge.md) | Microsoft Edge Add-ons | free | Partner Center, short description comes from the package |
| [firefox.md](firefox.md) | Firefox Add-ons | free | AMO signs the zip itself, no compiling on your side |
| [amo-form.md](amo-form.md) | Firefox Add-ons | | The submission form filled in, field by field |
| [opera.md](opera.md) | Opera add-ons | free | Manual review, slowest of the four |
| [brave.md](brave.md) | Brave | free | No store of its own, nothing to submit |
| [privacy-policy.md](privacy-policy.md) | all | | Host it as a web page, every store wants the URL |

## Before submitting

1. `node src/tools/build.js`. It writes two zips into `extensions/`: `chromium` goes to Chrome, Edge, Brave and Opera, `firefox` goes to AMO.
2. Load `extensions/chromium/` or `extensions/firefox/` unpacked once and click through it.
3. Fill in the website address. The sheets carry a placeholder.
4. Take the screenshots. Every store wants its own size, see the table in each sheet.

## License

**All Rights Reserved** wherever a store asks. The repository carries the GeoNoMore License in `LICENSE`: source available, contributions welcome, and publishing and earning reserved to the author. No open source licence does that, AGPL included, so do not pick one because a form makes it look tidier.

## What is the same everywhere

- Title, summary and description: written once, in `chrome.md`
- Author: Miabeyefendi - Mustafa Ihsan Albayrak
- Contact mail: mustafaihsanalbayrak@hotmail.com
- Version: 5.1.2

## What differs

- There are two packages, not five. Chrome, Edge, Brave and Opera share the same engine and take the identical manifest, so the same `chromium` zip is uploaded to all four.
- Firefox needs the gecko id and a background script list rather than a service worker. `tools/build.js` writes both.
- Opera wants narrower screenshots, 612x408.
- Edge reads the short description from the package, not from the form.
- Chrome asks for a justification per permission and a single purpose statement.
