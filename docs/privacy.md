---
title: Privacy
permalink: /privacy/
description: What the siteready website collects, and what stays in your browser.
---

# Privacy

Last updated 2026-10-25.

This is the documentation website for siteready, an open-source project run by Daniel Kim. There are no accounts or
ads, and nothing here is sold. This page covers the website only: the `siteready` command-line tool runs on your own
machine.

## Google Analytics

The site uses Google Analytics 4 to see which pages are read and how people arrive. It loads only after you press
Accept in the cookie banner, and only on the live site. If you decline, no analytics tag loads and no analytics cookies
are set. Declining after accepting stops the tag from the next page load; cookies already set stay until they expire.

- **Collected:** pages viewed (the full address, including any query string), referrer, approximate location, browser,
  device and screen size, language, and interaction events such as outbound clicks and scrolls.
- **Cookies:** `_ga` and a second cookie starting with `_ga_`, which identify a browser anonymously across visits.
- **IP address:** Google Analytics 4 does not log or store IP addresses; Google receives it with the request that
  delivers the tag.
- **Processor:** Google, under [Google's privacy policy](https://policies.google.com/privacy). Data may be processed
  outside your country.
- **Opting out:** press Decline, or use a content blocker, your browser's tracking protection, or the
  [Google Analytics opt-out add-on](https://tools.google.com/dlpage/gaoptout).

<p><button type="button" data-consent-reset>Change cookie settings</button></p>

## Hosting

The site is served by GitHub Pages. GitHub processes requests and keeps technical logs (such as IP address, requested
address and browser) to run and secure the service, under
[GitHub's privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

## Stored in your browser

These stay on your device and are never sent anywhere by this site:

- `siteready-consent`: your cookie choice (accepted or declined).

This site shares the `dkdev24.github.io` domain with other projects of mine, so cookies set for that domain are
visible to them.

## Links to other sites

Links to GitHub, npm and other sites are governed by their own policies.

## Your rights and contact

Depending on where you live (for example under the GDPR or Korea's PIPA) you may be able to ask what is held about you
or have it deleted. Analytics data is anonymous and tied only to a browser cookie, so clearing cookies is the practical
way to reset it. For anything else, open an issue at
[github.com/dkdev24/siteready](https://github.com/dkdev24/siteready/issues).
