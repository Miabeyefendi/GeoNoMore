<!--
================================================================================
CHANGELOG TEMPLATE - Miabeyefendi (https://github.com/Miabeyefendi)

RULES
  1. Newest release on top. Never rewrite a released entry.
  2. Dates are ISO, YYYY-MM-DD, and are the real publish date.
  3. Versions follow semantic versioning: MAJOR.MINOR.PATCH.
       MAJOR - something that used to work now works differently
       MINOR - new capability, nothing broken
       PATCH - fix only
  4. Only these six group headings, always in this order. Delete the empty ones.
       Added · Changed · Fixed · Removed · Deprecated · Security
  5. Write for the person using the software, not for the person who wrote it.
     "Volume tooltip no longer sticks after a track change" beats
     "refactor volume handler".
  6. Single language. This file stays English, like commit messages.
  7. Link each version number to its release page.
================================================================================
-->

# Changelog

All notable changes to **GeoNoMore** are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

[English](./CHANGELOG.md) · [README](./README.md)

---

## [Unreleased]

---

## [5.1.2] - 2026-11-27

### Changed

- The privacy policy, store texts and the site list hint now describe what the extension really does: its scripts load on every page, and the map in the settings page loads pictures from the tile server you picked.
- The settings export no longer includes the custom map address, because it can contain an API key. Importing a file keeps the address you already have.

### Security

- With "only these sites" selected, an empty frame on a protected site could get your real location. Empty and inline frames now follow the rule of the site they belong to; excluded sites keep real values in their frames too.
- Pages could still read your real time zone and language in several ordinary ways: through the constructor of a date, number or worker object, through `Date()`, dates built from year and month, `Date.parse` and `setHours`, through a frame read the moment it was created, through `data:` workers and workers started by other workers, and through upper and lower case conversion. All of these now give the fake values.
- WebSocket connections, beacons, link pings and security reports were sent with your real language header.
- The language header was also sent to sites where the extension does not run. It now follows your site list.
- The rule that identifies GeoNoMore to OpenStreetMap applied to every website's map requests. It now applies only to the extension's own map.
- The log stored full page addresses, and real coordinates on pages where the extension was off. It now stores only the site name, and nothing for inactive pages or private windows. Logs and movement history from earlier versions are deleted when you update, and Reset now clears them too.
- The log no longer stores setting values, searched addresses or the country your IP check found.

---

## [5.1.1] - 2026-11-27

### Fixed

- In Russia, places in the UTC+4 region (Samara, Izhevsk, Saratov, Astrakhan, Ulyanovsk) and on Sakhalin showed a time one hour off. They now get their own time zone, and Novosibirsk, Tomsk, Barnaul, Chita, Kirov and Anadyr use their own zone names.

### Security

- Any script on a web page could read your GeoNoMore settings, including saved places, per site rules, a custom map address with its key and the log, even when the extension was switched off. Settings now travel through a private channel, and a page only receives what is needed to fake the location on that page. Nothing about your location is sent where GeoNoMore is off or the site is excluded.

---

## [5.1.0] - 2026-11-20

### Added

- New logo and toolbar icon: a hooded figure whose face is a location pin, readable at 16 px on light and dark toolbars.
- Redesigned settings page: an icon sidebar, a "What sites see" strip that always shows the location, time zone and language sites get, and a larger map with its controls on top of it. The popup opens on the same summary.
- IP check: one click shows where your real connection appears to be and whether it matches your fake location. Your IP is never stored or logged.
- In countries with several time zones, such as the United States, Russia or Brazil, the time zone now follows the exact place you pick instead of the capital.
- Tracking protection group: send Global Privacy Control, strip tracking parameters (utm_*, fbclid, gclid and similar) from links, block link click pings, and turn off DNS pre-resolving.
- Chrome only: turn off Privacy Sandbox ad tracking (Topics, Protected Audience and ad measurement).
- Firefox only: block tracking content in every window, not just private ones.
- Protection inside web workers, so background scripts see the same time zone and language as the page.
- Device details option: common values for processor cores, memory and touch points, one microphone, camera and speaker for sites without permission, and in Chrome a hidden connection speed and battery level.

### Changed

- In the light theme, lime buttons and checkboxes now have a dark outline, so they stay readable on white.
- The keyboard layout and the list of speech voices no longer give away your real language.

### Fixed

- A page could read your real time zone and language through a frame it had just created. Frames now get the same values as the page.
- In Chrome, scripts that ran in the very first moment of a page load could see your real time zone and language. They now see the fake ones from the start.
- In Chrome, a page could detect that GeoNoMore was installed through a leftover marker. The marker is removed before any page script runs.
- The newer Temporal date API no longer reveals your real time zone.

---

<!-- Keep this link block at the bottom and add one line per release. -->

[Unreleased]: https://github.com/Miabeyefendi/GeoNoMore/compare/v5.1.2...HEAD
[5.1.2]: https://github.com/Miabeyefendi/GeoNoMore/releases/tag/v5.1.2
[5.1.1]: https://github.com/Miabeyefendi/GeoNoMore/releases/tag/v5.1.1
[5.1.0]: https://github.com/Miabeyefendi/GeoNoMore/releases/tag/v5.1.0
