# GeoNoMore - Opera add-ons

Copy and paste sheet for the submission form. Fill it top to bottom, the order matches the form.

- Store: https://addons.opera.com/developer/
- Package: `extensions/geonomore-chromium-5.1.2.zip` (`node src/tools/build.js chromium`)
- Version: 5.1.2
- Author: Miabeyefendi - Mustafa Ihsan Albayrak
- Contact mail: mustafaihsanalbayrak@hotmail.com
- Website: https://geonomore.com   TODO: the domain is not live yet, put the real address here before submitting

## Account

Free. Register at the Opera add-ons developer page. Review is by hand and is the slowest of the four, so submit here last and do not wait on it.

Opera takes a zip. It repackages into its own nex format itself, there is nothing to convert on your side.

## Listing fields

**Title**

```
GeoNoMore - Fake GPS Location
```

Opera shows a narrower title than Chrome does, so the short form reads better in the list.

**Short description**

```
Fake your GPS location in one click. Spoof geolocation, time zone and language per site, or move along a route you drew.
```

**Long description**

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
- Time zone: Intl and Date agree with the fake place, so a site comparing the two finds nothing odd
- Language: navigator.language and the Accept-Language request header
- IP lookups the page makes itself, such as ipapi.co and similar services, are answered with the country you picked
- WebRTC local IP leak protection while the extension runs

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

- Every setting change, every location given to a site and everything the background does is written to a log you can read, copy or download
- Movement history is kept separately and is off by default
- Dark and light theme, and five interface languages: English, Turkish, Spanish, Russian and Chinese

WHAT IT CANNOT DO

Your IP address does not change and no browser extension can change it. A site that looks up your location on its own server still sees your real country. That needs a VPN. GeoNoMore is not a VPN, not a proxy and not a tunnel.

PRIVACY

No account, no sign up, no telemetry, no tracking, no ads. Settings stay in your browser. The extension itself only contacts map and lookup services: the map in the settings page loads its pictures from the tile server you picked (OpenStreetMap by default) when that page shows it, the optional address search goes to OpenStreetMap when you search, and the optional IP check asks a public IP service (geojs.io, then ipwho.is or freeipapi.com) where your connection appears to be when you press Check.
```

**Category**: Accessibility or Developer tools, whichever the form offers. Second choice: Privacy & security.

**Tags**: fake gps, location spoofer, change location, fake location, geolocation spoofer, gps spoofer, spoof timezone

**Support URL or mail**: mustafaihsanalbayrak@hotmail.com

## Images to prepare

| Asset | Size | Notes |
|---|---|---|
| Icon | 128x128 PNG | `src/extension/assets/icons/128.png`. 48x48 and 16x16 are in the package too |
| Screenshots | 612x408 PNG preferred, 800x600 maximum | Narrower than the Chrome shots, crop them separately |

Opera asks for anti aliased PNG with a transparent background where a transparent icon is used. The generated icons are already like that.

## Acceptance criteria worth reading twice

- The extension must do what the description says and nothing beyond it.
- No obfuscated or minified code. This package has neither, it is plain source.
- No remote code loading. There is none.
- Permissions have to be justified in the form:

| Permission | Why it is needed |
|---|---|
| `storage` | Keeps your settings, presets, rules and log in the browser. Nothing leaves the machine. |
| `privacy` | While the extension runs, turns on the browser WebRTC setting that stops a page from reading your local IP, and turns off DNS pre-resolving, link click pings and the Privacy Sandbox ad features (Topics, Protected Audience, ad measurement). Each can be switched off in Protection. All are cleared again when it stops. |
| `declarativeNetRequestWithHostAccess` | Sets the Accept-Language request header so it matches the country you picked; without it the header would contradict the fake location. While the extension runs it also sends the Global Privacy Control header (Sec-GPC: 1) and removes tracking tags such as utm_* and fbclid from page addresses. Both can be switched off in Protection. |
| `host_permissions: <all_urls>` | Both content scripts load on every page, because the location a site sees can only be changed inside that page. The user decides in the Sites tab where the fake values apply; where the extension is off or the site is excluded, the page gets the real values and nothing about the chosen location is handed to it. |

We do not collect, transmit or sell any user data.

- No analytics, no telemetry, no crash reporting, no ads, no accounts.
- Settings, logs and movement history stay in browser local storage on the user device.
- The extension makes three kinds of outbound request. Map pictures are loaded from the selected tile server (OpenStreetMap, OpenStreetMap Germany, OpenTopoMap or an address the user enters) when the settings page shows the map; for OpenStreetMap the extension sends its store page as Referer on its own requests only, as the tile usage policy requires. The address search is sent to the OpenStreetMap Nominatim service when the user searches. The IP check asks a public IP service (geojs.io, falling back to ipwho.is and freeipapi.com) for the country and time zone of the connection when the user presses Check; the IP address is not stored or logged. The interface states the last two next to the control.
