# GeoNoMore - Chrome Web Store

Copy and paste sheet for the submission form. Fill it top to bottom, the order matches the form.

- Store: https://chrome.google.com/webstore/devconsole
- Package: `extensions/geonomore-chromium-5.1.0.zip` (`node src/tools/build.js chromium`)
- Version: 5.1.0
- Author: Miabeyefendi - Mustafa Ihsan Albayrak
- Contact mail: mustafaihsanalbayrak@hotmail.com
- Website: https://geonomore.com   TODO: the domain is not live yet, put the real address here before submitting

## Account

One time developer fee of 5 USD, paid once per Google account. Review usually takes a few days, longer when an extension asks for broad host access, which this one does.

## Listing fields

**Title** (max 75 characters, keep the brand first, keywords right after)

```
GeoNoMore - Fake GPS Location Spoofer and Geolocation Changer
```

**Summary** (max 132 characters, this is the line shown in search results, so the strongest keywords belong here)

```
Fake your GPS location in one click. Spoof geolocation, time zone and language per site, or move along a route you drew.
```

**Description** (long form, the field is generous, paste as is)

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
- Time zone: Intl, Date and the newer Temporal API agree with the fake place from the very first script on the page, so a site comparing them finds nothing odd. In countries with several time zones, such as the United States, Russia or Brazil, it follows the exact place you pick
- Language: navigator.language, the Accept-Language request header, the keyboard layout and the list of speech voices
- Web workers: background scripts see the same time zone and language as the page
- IP lookups the page makes itself, such as ipapi.co and similar services, are answered with the country you picked
- WebRTC local IP leak protection while the extension runs

TRACKING AND FINGERPRINT

- Send Global Privacy Control, strip tracking tags (utm_*, fbclid, gclid and similar) from links, block link click pings and turn off DNS pre-resolving
- Chrome only: turn off Privacy Sandbox ad tracking (Topics, Protected Audience and ad measurement)
- Device details: common values for processor cores, memory and touch points, one microphone, camera and speaker for sites you have not given permission, and a hidden connection speed and battery level

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

**Category**: Tools. Second choice: Developer Tools.

**Language**: English (the interface also ships Turkish, Spanish, Russian and Chinese, mention it in the description, not the title).

## Images to prepare

| Asset | Size | Notes |
|---|---|---|
| Store icon | 128x128 PNG | `design/marketing/chrome-store-v2/store-icon-128.png` (96 px logo, 16 px transparent edge, as Google asks) |
| Screenshots | 1280x800 PNG, at least 1, up to 5 | `design/marketing/chrome-store-v2/1-5.png`, Chrome's own set |
| Small promo tile | 440x280 PNG or JPEG | `design/marketing/chrome-store-v2/small-tile-440x280.png` |
| Marquee promo tile | 1400x560 PNG or JPEG | `design/marketing/chrome-store-v2/marquee-1400x560.png`, optional |

## Privacy tab

**Single purpose**

```
Report a location the user has chosen to websites instead of the real one, and keep the time zone and language consistent with it.
```

**Permission justifications**

| Permission | Why it is needed |
|---|---|
| `storage` | Keeps your settings, presets, rules and log in the browser. Nothing leaves the machine. |
| `privacy` | While the extension runs, turns on the browser WebRTC setting that stops a page from reading your local IP, and turns off DNS pre-resolving, link click pings and the Privacy Sandbox ad features (Topics, Protected Audience, ad measurement). Each can be switched off in Protection. All are cleared again when it stops. |
| `declarativeNetRequestWithHostAccess` | Sets the Accept-Language request header so it matches the country you picked; without it the header would contradict the fake location. While the extension runs it also sends the Global Privacy Control header (Sec-GPC: 1) and removes tracking tags such as utm_* and fbclid from page addresses. Both can be switched off in Protection. It also adds a Server-Timing entry carrying only the chosen time zone and language to pages as they arrive, so the fake values apply before the page's own scripts run; the browser adds it locally and it is never sent to any server. |
| `host_permissions: <all_urls>` | The location a site sees can only be changed on that site. The user decides where it runs from the Sites tab, and no code is injected where it is switched off. |

**Data usage**: tick nothing. Then the declaration:

We do not collect, transmit or sell any user data.

- No analytics, no telemetry, no crash reporting, no ads, no accounts.
- Settings, logs and movement history stay in browser local storage on the user device.
- The extension makes two optional outbound requests, both started by the user. The address search is sent to the OpenStreetMap Nominatim service when the user types a query into the search box. The IP check asks a public IP service (geojs.io, falling back to ipwho.is and freeipapi.com) for the country and time zone of the connection when the user presses Check; the IP address is not stored or logged. The interface states both next to the control. Nothing is sent when neither is used.

**Privacy policy URL**: required, host `docs/store/privacy-policy.md` as a web page and link it here.

## Keywords

The store has no keyword field. Search leans on the title, the summary and the first lines of the description, so these words have to appear there naturally: fake gps, fake location, location spoofer, change location, geolocation spoofer, gps spoofer, geo spoofing, fake geolocation, location changer, spoof timezone, hide location, gps emulator, virtual location, location privacy, change country
