# Security

## Where the key lives

Looker Studio asks for the key through its own credentials dialog (`AuthType.KEY`) and passes
it to `setCredentials`. The connector stores it in one place: the Apps Script **user
properties** of the person who entered it, under `dscc.key`, as Google's KEY example does.
User properties are private to that Google account and that Script project.

The key is never written to the code, the config, the script properties, the cache, a log line
or an error message. It leaves Apps Script only as the configured request header, and only to
the configured host: redirects to another host are refused.

The project has no server. Requests go from Google's Apps Script infrastructure to your API.

## What else is stored

- User properties, `connector.endpoint`: the last request URL that `getSchema` used (including
  your query string) and the header name and scheme. It is what a new key is checked against.
  If your query string holds a secret, it is stored here, next to the key and as private.
- User cache: API responses under about 90 KB for 5 minutes, under a SHA-256 name, and a flag
  that the key was accepted recently.

"Revoke access" in Looker Studio calls `resetAuth`, which deletes the key, the endpoint and the
flag.

## What is logged

The connector writes no log lines. `isAdminUser()` returns false, so Looker Studio shows users
only the error text the connector wrote. Those texts name the API host and path, never the
query string, the key or the text of an underlying exception. Apps Script records uncaught
exceptions in the project's Cloud Logging (`exceptionLogging` in `appsscript.json`); what it
records are those same texts.

## SSRF rules

The API URL comes from the user, so it is checked before any request:

- `https://` only; no user name or password in the URL; no `#` part.
- Refused hosts: `localhost`, names ending in `.localhost`, `.local`, `.internal`, names without
  a dot, every IPv6 literal, and the IPv4 ranges `0/8`, `10/8`, `100.64/10`, `127/8`,
  `169.254/16`, `172.16/12`, `192.168/16`, `224/3`.
- An address must be a plain dotted quad: decimal, hexadecimal, octal and short forms
  (`2130706433`, `0x7f.0.0.1`, `0177.0.0.1`, `127.1`) are refused.
- Redirects are not followed automatically. A redirect is followed only to the same host and
  port over https, at most three times; any other redirect is an error.

Known gap: Apps Script cannot resolve DNS before a request, so a public name that resolves to a
private address is not detected. The request still runs from Google's network, not yours, so it
cannot reach your private network.

## Rotating a key

See "Token rotation" in the README. In short: create the new token, choose **Revoke access**
on the connector in Looker Studio, enter the new token, revoke the old one in the API.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private reporting on this repository (**Security >
Report a vulnerability**). Include the steps to reproduce and no real keys. A dedicated
contact address is not set up yet (`docs/PUBLISHING.md`, "What we still lack").
