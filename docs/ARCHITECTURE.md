# Architecture

A Looker Studio community connector is an Apps Script project that defines a few global
functions. Looker Studio calls them; there is no server of ours anywhere.

```
Looker Studio --calls--> Apps Script (this code, in the owner's account) --GET--> the JSON API
```

## Files

| File | Role | Apps Script services |
| --- | --- | --- |
| `src/main.js` | Entry points `getConfig`, `getSchema`, `getData`, `isAdminUser`; turns errors into user errors | `DataStudioApp`, `CacheService` |
| `src/auth.js` | `getAuthType`, `setCredentials`, `isAuthValid`, `resetAuth` | `PropertiesService`, `CacheService` |
| `src/fetch.js` | One GET, manual redirects, size limit, cache | `UrlFetchApp`, `CacheService`, `Utilities` |
| `src/settings.js` | Reads and checks the config, builds the key header and the cache key text | none |
| `src/url.js` | URL validation (https, public hosts), request URL, redirect rules | none |
| `src/jsonpath.js` | Finds the array of rows at a dot path | none |
| `src/flatten.js` | Flattens nested objects, refuses arrays | none |
| `src/types.js` | Type inference, type overrides, field ids | none |
| `src/dates.js` | Date detection and `YYYYMMDD` conversion | none |
| `src/rows.js` | Field selection, value conversion, row building | none |
| `src/errors.js` | `UserFacingError` | none |

`appsscript.json` is the manifest. The product name lives there (`dataStudio.name`); the other
places that repeat it are the README title and `package.json`.

## One request

`getSchema(request)` and `getData(request)` share one path:

1. `readSettings(request.configParams)` checks every field and applies defaults.
2. `buildRequestUrl` adds the query string and the date range. `getData` uses the report's
   range; `getSchema` gets none from Looker Studio, so it asks for the last 28 days.
3. `fetchJson` looks in the per-user cache, otherwise sends one GET with the key header.
4. `extractRows` finds the array; the row limit is checked; `flattenRow` flattens each row.
5. `inferFields` looks at the first 100 rows and applies the "Field types" override.
6. `getSchema` returns all fields. `getData` returns the requested fields, in the requested
   order, and the converted rows.

## Decisions

- **The schema is inferred on every call, not stored.** Storing it would need a second source
  of truth. It stays stable because inference is deterministic over the first 100 rows; where
  the data itself is unstable, the override pins a type. `getData` converts each value to the
  type of its field and gives `null` when it cannot, so a type that drifts never breaks a chart.
- **Field ids replace every character outside `A-Z a-z 0-9 _` with `_`.** Looker Studio allows
  only those in a field id. The dotted path stays as the display name.
- **Redirects are followed by hand.** `UrlFetchApp` would follow them to any host and resend
  the headers; the connector follows only same-host https redirects, at most three.
- **The cache is per user and its key holds no secret.** The key is a SHA-256 of the request
  URL and the header settings. The API key is not an input, and the per-user cache keeps two
  users with different keys apart.
- **Auth functions get no config.** Looker Studio calls `isAuthValid` and `setCredentials`
  without the data source config, so the connector remembers the last request URL that
  `getSchema` used and checks a key against it. Before any data source exists there is nothing
  to check against, so the first key is accepted as entered and verified by the first
  `getSchema`. A positive check is cached for 5 minutes to avoid doubling the API traffic.
- **`isAdminUser()` is false.** No debug text or stack trace reaches the report.

## Tests

`test/helper.js` runs every file of `src/` in one `vm` context, as Apps Script would, with
stand-ins for the services. `test/pure.test.js` covers the pure functions;
`test/connector.test.js` drives the entry points end to end.
