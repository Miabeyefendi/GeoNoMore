# GeoNoMore - Firefox Add-ons (AMO)

Copy and paste sheet for the submission form. Fill it top to bottom, the order matches the form.

- Store: https://addons.mozilla.org/developers/
- Package: `extensions/geonomore-firefox-5.1.1.zip` (`node src/tools/build.js firefox`)
- Version: 5.1.1
- Author: Miabeyefendi - Mustafa Ihsan Albayrak
- Contact mail: mustafaihsanalbayrak@hotmail.com
- Website: https://geonomore.com   TODO: the domain is not live yet, put the real address here before submitting

## Account

Free. A Mozilla account is enough. No compiling and no signing on your side: you upload the zip and AMO signs it into an xpi itself. Self distribution outside AMO is the only case that needs the signing API, and it is not needed here.

The package must carry `browser_specific_settings.gecko.id`, and `extensions/geonomore-firefox-5.1.1.zip` already does. Also note Firefox runs the background as a script list rather than a service worker, which `src/tools/build.js` handles.

Two things AMO validation rejects if they are missing or wrong:

- The minimum versions are 140 desktop and 142 Android, not 128. Support for `data_collection_permissions` arrived in those releases, and naming an older floor makes validation warn that the key did not exist yet. Firefox 140 is an ESR, so nothing real is left behind.
- `data_collection_permissions` is mandatory for every new add-on since 3 November 2025. This one declares `required: ["none"]` because the extension collects and transmits nothing. The address search and the IP check are user actions that go to OpenStreetMap and a public IP service, covered in the privacy policy and in the review note below.
- `gecko_android` is present, so the listing covers Firefox for Android too. Every API the extension uses is supported there and all of them predate version 128. AMO still marks Android with a grey tick rather than a blue one, which only means nobody has run it on a device yet, not that anything is missing. See `extensions/for mobile/README.md`.

## Listing fields

**Name**

```
GeoNoMore - Fake GPS Location Spoofer and Geolocation Changer
```

**Add-on URL slug**

```
geonomore
```

**Summary** (max 250 characters, AMO gives more room than the other stores, so use it)

```
Fake your GPS location in one click. GeoNoMore reports a place you choose instead of where you really are, and keeps the time zone and the language in step with it so nothing contradicts. Pick a fixed point, hide inside a privacy zone, or move along a route you drew on the map.
```

**Description**

```
GeoNoMore changes the location your browser hands to websites. Pick a country, a city or a point on the map, press play, and every site that asks where you are gets that place instead of your real one.

WHY PEOPLE USE IT

- Test a site or a web app as if you were in another country
- Keep your real street out of maps, shops, delivery, dating and social sites
- See local prices, local results and local content
- Walk, cycle or drive along a route you drew, without leaving your chair
- Stop a page from pinning you to your home while you work

WHAT IT CHANGES

- GPS and geolocation: getCurrentPosition and live watchPosition tracking
- Time zone: Intl, Date and the newer Temporal API agree with the fake place, so a site comparing them finds nothing odd. In countries with several time zones, such as the United States, Russia or Brazil, it follows the exact place you pick
- Language: navigator.language, the Accept-Language request header, the keyboard layout and the list of speech voices
- Web workers: background scripts see the same time zone and language as the page
- IP lookups the page makes itself, such as ipapi.co and similar services, are answered with the country you picked
- WebRTC local IP leak protection while the extension runs

TRACKING AND FINGERPRINT

- Send Global Privacy Control, strip tracking tags (utm_*, fbclid, gclid and similar) from links, block link click pings and turn off DNS pre-resolving
- Firefox only: block tracking content in every window, not just private ones
- Device details: common values for processor cores, memory and touch points, and one microphone, camera and speaker for sites you have not given permission

THREE WORKING MODES

- Fixed point: the exact coordinates you picked, reported as they are
- Fixed zone: a random point inside a ring around you, so the real spot is never handed over. Low, medium and high privacy levels, or your own radius in metres
- Moving: the position walks, cycles, drives or commutes along your route with a real speed and heading, so a page watching you sees a coherent track

PER SITE CONTROL

- Run everywhere, only on a list of sites, or everywhere except a list
- Give a single site its own coordinates and its own privacy level
- Ready made domain groups for social media, shopping, maps, streaming, banking, food delivery, travel and more, and you can add your own addresses to any group
- Temporary override: give one site your exact location for 5, 15, 30 or 60 minutes, or until the browser closes

AUTOMATION

- Presets: save Home, Work, Travel or any place you like and switch with one click
- Schedule: a preset takes over at a time you set on the days you pick, the way your day actually moves
- No background timer. Where you are is read off the clock, so a sleeping browser changes nothing

HARDENING

- The patch follows the page into frames it creates, which is the widest way a site can read around a location spoofer
- Patched functions look built in, so a cheap check does not spot them
- Where GeoNoMore is off, it can refuse instead of handing over the real position

TRANSPARENCY

- IP check: one click shows where your real connection appears to be and warns you when it contradicts the fake location
- Every setting change, every location given to a site and everything the background does is written to a log you can read, copy or download
- Movement history is kept separately and is off by default
- Dark and light theme, and five interface languages: English, Turkish, Spanish, Russian and Chinese

WHAT IT CANNOT DO

Your IP address does not change and no browser extension can change it. A site that looks up your location on its own server still sees your real country. That needs a VPN. GeoNoMore is not a VPN, not a proxy and not a tunnel.

PRIVACY

No account, no sign up, no telemetry, no tracking, no ads. Settings stay in your browser. The extension makes only two kinds of network request, both started by you: the optional address search, which goes to OpenStreetMap when you type in the search box, and the optional IP check, which asks a public IP service (geojs.io, then ipwho.is or freeipapi.com) where your connection appears to be when you press Check. The interface says so on the spot.
```

**Categories**: at most 2. Privacy & Security first, then Other.

**Tags**: AMO does not take free text here, you pick from its own list. Choose whatever comes closest to privacy, security and location.

**Support email**: mustafaihsanalbayrak@hotmail.com

**Support site**: leave empty until the domain is live, AMO does not require it

**License**: **All Rights Reserved**. None of the open source options fit: every one of them, AGPL included, lets someone else sell the code and publish their own copy. The repository carries the GeoNoMore License, which keeps the source readable and contributions open while reserving publishing and earning to the author. Field by field help is in [amo-form.md](amo-form.md).

**Privacy policy**: required because the address search and the IP check leave the machine. Paste `docs/store/privacy-policy.md`.

## Images to prepare

| Asset | Size | Notes |
|---|---|---|
| Add-on icon | 128x128 PNG | `src/extension/assets/icons/128.png` (logo2) |
| Screenshots | 1280x800 PNG | `design/marketing/firefox-amo/1-5.png`, Firefox's own set (not the Chrome one) |

## Review notes for Mozilla

AMO reviewers read the source. Give them this note:

```
The extension is written in plain JavaScript with no build step and no minified code. The
zip is the source. The page patch in content/injected.js is turned into text and injected
as an inline script by content/bridge.js, which is the same approach Location Guard uses,
because a content script cannot reach the page realm otherwise. No remote code is loaded
at any point. The only outbound requests are the optional address search to OpenStreetMap
Nominatim, made only when the user types into the search box, and the optional IP check
(geojs.io, then ipwho.is or freeipapi.com), made only when the user presses Check.

On data collection: the manifest declares none, because the extension collects and
transmits nothing of its own. The chosen location, the settings, the log and the movement
history all stay in local storage on the device. The address search sends the text the
user typed to OpenStreetMap Nominatim to turn it into coordinates, only when the user
types into that box and presses search, and the interface says so next to the box. The IP
check asks a public IP service for the country and time zone of the connection, only when
the user presses Check; the IP address is shown nowhere and is not stored or logged.
Nothing is sent to us, there is no server on our side and there is no telemetry.
```

## Permissions

| Permission | Why it is needed |
|---|---|
| `storage` | Keeps your settings, presets, rules and log in the browser. Nothing leaves the machine. |
| `privacy` | While the extension runs, turns on the browser WebRTC setting that stops a page from reading your local IP, and turns off DNS pre-resolving and link click pings. If the user opts in, it also turns on tracking protection in every window. Each can be switched off in Protection. All are cleared again when it stops. |
| `declarativeNetRequestWithHostAccess` | Sets the Accept-Language request header so it matches the country you picked; without it the header would contradict the fake location. While the extension runs it also sends the Global Privacy Control header (Sec-GPC: 1) and removes tracking tags such as utm_* and fbclid from page addresses. Both can be switched off in Protection. |
| `host_permissions: <all_urls>` | The location a site sees can only be changed on that site. The user decides where it runs from the Sites tab, and no code is injected where it is switched off. |

We do not collect, transmit or sell any user data.

- No analytics, no telemetry, no crash reporting, no ads, no accounts.
- Settings, logs and movement history stay in browser local storage on the user device.
- The extension makes two optional outbound requests, both started by the user. The address search is sent to the OpenStreetMap Nominatim service when the user types a query into the search box. The IP check asks a public IP service (geojs.io, falling back to ipwho.is and freeipapi.com) for the country and time zone of the connection when the user presses Check; the IP address is not stored or logged. The interface states both next to the control. Nothing is sent when neither is used.
