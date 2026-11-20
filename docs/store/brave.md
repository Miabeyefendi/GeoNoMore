# GeoNoMore - Brave

Copy and paste sheet for the submission form. Fill it top to bottom, the order matches the form.

- Store: https://chrome.google.com/webstore/devconsole
- Package: `extensions/geonomore-chromium-5.1.0.zip` (`node src/tools/build.js chromium`)
- Version: 5.1.0
- Author: Miabeyefendi - Mustafa Ihsan Albayrak
- Contact mail: mustafaihsanalbayrak@hotmail.com
- Website: https://geonomore.com   TODO: the domain is not live yet, put the real address here before submitting

## There is no Brave store

Brave has no extension store of its own. It reads the Chrome Web Store, and a listing published there is installable in Brave without any extra step. So there is nothing separate to submit.

`extensions/chromium/` and `extensions/geonomore-chromium-5.1.0.zip` exist for two reasons: loading the unpacked build in Brave while testing, and handing the file to someone directly. The manifest is identical to the Chrome one.

## What to do

1. Publish the Chrome listing, see `chrome.md`.
2. Test in Brave: `brave://extensions`, Developer mode on, Load unpacked, pick `extensions/chromium`.
3. Mention Brave in the Chrome description so people searching for it find the listing.

## Things to check in Brave specifically

- Brave Shields block scripts on some sites. If a page is broken with the extension on, check whether Shields is the reason before blaming the patch.
- Brave has its own fingerprint protection. It can already report a rounded time zone, so read the History tab log rather than a fingerprint test page when the two disagree.
- WebRTC: Brave has its own IP handling policy setting. The extension sets the same browser level policy, so the last one applied wins.

## Listing text

The same as the Chrome listing. Title, summary and description are in `chrome.md`, there is no second version to maintain.

**Contact mail**: mustafaihsanalbayrak@hotmail.com
