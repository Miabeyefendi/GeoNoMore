# GeoNoMore privacy policy

Last updated: 20 November 2026

GeoNoMore is a browser extension that reports a location you choose to websites instead of your real one.

## What we collect

Nothing. There is no account, no sign up, no analytics, no telemetry, no crash reporting and no advertising. We do not have a server that receives anything from the extension.

## What stays on your device

The extension keeps the following in your browser local storage, on your own machine:

- Your settings: the chosen place, coordinates, privacy zone, time zone, language and the toggles
- Your presets, your per site rules and your schedule
- The event log. On pages where the extension is switched on it records the site address (without the path) and the fake location handed to it; for your own changes it records which settings changed, plus the chosen time zone and language. Nothing is recorded on sites where it is off or excluded, or in private windows. Reset clears it
- Movement history, which is off by default and only records while you switch it on

None of this is transmitted anywhere. Clearing the extension data or removing the extension removes it.

## Requests the extension makes itself

- **Map pictures.** When the settings page shows the map, the pictures for the area on screen are loaded from the tile server you selected: OpenStreetMap by default, OpenStreetMap Germany, OpenTopoMap, or an address you enter. That server sees your IP address and which area is shown, which is usually the place you chose. OpenStreetMap requires an app to identify itself, so on the extension's own requests to it the Referer is the GeoNoMore store page.
- **Address search.** When you type an address into the search box and press search, the text you typed is sent to the OpenStreetMap Nominatim service so it can be turned into coordinates. The interface says so next to the search box.
- **IP check.** When you press Check in the IP field, the extension asks a public IP service (geojs.io; if it does not answer, ipwho.is, then freeipapi.com) which country, city and time zone your connection appears to come from, so it can warn you when that contradicts the location you chose. The extension does not store or log your IP address; it keeps the country and time zone only while the settings page is open.

Each request carries your real IP address, as any web request does. The address search and the IP check happen only when you start them. If you never open the settings page and use neither, the extension makes no request of its own. The country and city list works offline.

## Permissions

- `storage`: to keep the settings above on your device
- `privacy`: while the extension runs, to switch on the browser setting that stops a page from reading your local IP over WebRTC, and to switch off DNS pre-resolving and link click pings. In Chrome it also switches off the Privacy Sandbox ad features; in Firefox, if you choose, it turns on tracking protection in every window. All are restored when it stops
- `declarativeNetRequestWithHostAccess`: to set the Accept-Language header so it matches your chosen country, to send the Global Privacy Control signal, to remove tracking tags such as utm_* and fbclid from page addresses, and to attach your chosen time zone and language to each page as it arrives, so they apply before the page's own scripts run. That last value is added by your browser to the page it receives and is never sent to any website. These rules run in your browser; nothing is sent to us
- access to websites: Both content scripts load on every page, because the location a site sees can only be changed inside that page. You decide in the Sites tab where the fake values apply; where the extension is off or the site is excluded, the page gets your real values and nothing about your chosen location is handed to it.

## What the extension cannot do

Your IP address does not change. A website that looks up your location on its own server, from your IP, still sees where you really are. That is outside what any extension can reach.

## Children

The extension is not directed at children and collects nothing from anyone.

## Changes

If this policy changes, the date at the top changes with it.

## Contact

mustafaihsanalbayrak@hotmail.com
Miabeyefendi - Mustafa Ihsan Albayrak
