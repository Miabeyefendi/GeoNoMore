# Build instructions

GeoNoMore is plain JavaScript. There is no bundler, no transpiler, no package
manager and no dependency to install.

## Requirements

- Node.js 18 or newer. Nothing else. Do not run `npm install`, there is no
  `package.json` and nothing to fetch.

## Steps

From the root of this source package:

```
node src/tools/build.js firefox
```

That is the whole build. It produces:

- `releases/extensions/firefox/`, the unpacked add-on
- `releases/extensions/geonomore-firefox-5.1.2.zip`, the exact file that was submitted

Run `node src/tools/build.js` with no argument to build the Chromium package as
well.

## What the build does

1. Copies every file under `src/extension/` verbatim into the output folder.
2. Writes `manifest.json` for the target browser.
3. Generates `content/fallback.js` by joining `src/extension/core/engine.js` and
   `src/extension/content/injected.js` inside a single IIFE. This is the only
   generated code. It is a plain concatenation, readable as written, with the
   comments kept. It is not minified, obfuscated or transformed.
4. Writes the zip.

Nothing is downloaded during the build and no code is fetched at runtime.

The build is deterministic: running it twice produces a byte identical zip.

## Why `content/fallback.js` exists

The location patch has to run in the page realm, which a content script in an
isolated world cannot reach. The file is loaded as a `world: "MAIN"` content
script. When that does not run, for example in `about:blank` and `srcdoc`
frames, `content/bridge.js` inserts the same file as a script element from
`web_accessible_resources`, and only as a last resort inlines the same code.
Loading the two source files separately in the MAIN world would leave their top
level declarations on the page's `window`, which would make the add-on
detectable by any site. The single wrapped file avoids that.

## Verifying

```
node src/tools/build.js firefox
```

Then compare `releases/extensions/geonomore-firefox-5.1.2.zip` against the submitted
file. They are identical.
