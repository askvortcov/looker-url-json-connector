# Roadmap

## Stage 1: MVP for private use

- [x] KEY auth with a configurable header name and scheme
- [x] Config: URL, query string, JSON path, date parameters, row limit, timeout, type override
- [x] Schema inference, nested objects, date conversion
- [x] Requested fields only, `null` for missing values, 5-minute per-user cache
- [x] User errors for every fixable problem; no secret in any message
- [x] URL rules against SSRF, same-host redirects only, row and size limits
- [x] Node tests for the pure functions and the entry points, checked by mutation
- [ ] **Owner:** deploy, connect, build one chart on real data (README quickstart)

### Not verified yet

Nothing here was run against Google: the code was tested with stand-ins for the Apps Script
services. The first real deployment must confirm:

- `clasp create-script` and `clasp push` with `rootDir` `.` and this `.claspignore` upload
  exactly `appsscript.json` and `src/*.js`.
- The manifest is accepted as written. Google's manifest reference names the field `addOnUrl`,
  while the example on the same page spells it `addonUrl`; if the editor complains, rename it.
- Which connect URL host works today: `lookerstudio.google.com` or `datastudio.google.com`.
- `UrlFetchApp` honours `timeoutSeconds` and returns the `Location` header of a redirect when
  `followRedirects` is false.
- Looker Studio accepts `null` cells for every field type.
- "Revoke access" is where the README says, and Looker Studio asks for a new key after
  `isAuthValid()` turns false.
- The CI workflow: it has never run.

## Stage 2: public repository

- [x] README, license, contribution guide, issue and pull request templates, CI
- [x] Website with the connector page, support, privacy policy and terms (`site/`, deployed to
      GitHub Pages by `.github/workflows/pages.yml`)
- [ ] **Owner:** enable GitHub Pages (source: GitHub Actions), set the custom domain and DNS
- [ ] **Owner:** add the operator's legal name and a contact to the privacy policy and the terms
- [ ] Demo GIF in the README
- [ ] **Owner:** enable private vulnerability reporting on GitHub, decide the final name

## Stage 3: connector gallery

Prepared, not submitted. The checklist and what is missing are in `docs/PUBLISHING.md`.

## v1.1: pagination (designed, not implemented)

It is left out of the MVP on purpose: the first API returns everything in one response, and
every extra mode is config that most users must read and skip.

Design:

- One new config field, **Pagination**, with the modes `none` (default), `page` and `cursor`,
  and three optional fields that matter only when a mode is on.
- `page` mode: query parameters `page` (starting at 1) and `limit` (page size, default 1000);
  both names configurable. Stop when a page has fewer rows than the page size or is empty.
- `cursor` mode: a JSON path to the next cursor in the response (for example
  `meta.next_cursor`) and the query parameter that takes it (default `cursor`). Stop when the
  cursor is missing, `null` or empty. A full "next URL" is accepted only on the same host, by
  the rule that redirects already follow.
- Limits stay total: the row limit and the 20 MB size limit count all pages together, and there
  is a hard cap of 50 pages per request, because one Apps Script run lasts at most 6 minutes.
- `getSchema` reads the first page only.
- The cache holds the combined rows under the existing key, so the 100 KB cache value limit
  matters more; splitting a value across cache entries belongs to the same change.
- Code: a loop in `loadRows` around `fetchJson`, with `nextPageRequest(settings, response,
  pageNumber)` as a pure function in a new `src/pagination.js`, tested like the others.

## Later, if someone asks

- Hours and minutes for timestamps (`YEAR_MONTH_DAY_SECOND`)
- `POST` with a JSON body
- Sending Looker Studio filters to the API
- Several keys per account (today: one key per deployment)

## Open questions

- The final product name. The working name is the repository name; the gallery rules advise
  against the word "connector" in a name and forbid shorthand names of the Google product
  (`docs/PUBLISHING.md`).
- Who is the "company" in the manifest, and on which domain the connector page, the privacy
  policy and the terms will live.
