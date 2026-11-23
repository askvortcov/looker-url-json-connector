<img src="assets/icon.svg" width="64" height="64" alt="">

# looker-url-json-connector

A free, open-source Looker Studio community connector that reads rows from any HTTPS JSON API
protected by a key in a request header.

> Status: MVP for private use. It is not in the Looker Studio connector gallery; you deploy it in
> your own Google account. Demo GIF: _placeholder, to be recorded_.

## The problem

Looker Studio has no free, generic way to read a JSON API that needs an authorization header.
The existing choices are:

- **Paid partner connectors.** They work, for a monthly fee.
- **Services in the middle.** You give a third party your API token, and your data passes
  through their servers.

This connector is neither. It is a Google Apps Script project that you deploy yourself. Requests
go from Google's Apps Script servers straight to your API. The project runs no server of its
own, so the token and the data never reach the authors.

## What it does

- Sends `GET <your URL>?<your query>&from=YYYY-MM-DD&to=YYYY-MM-DD` with
  `Authorization: Bearer <key>`. The header name, the scheme and the date parameter names are
  configurable.
- Finds the rows at an optional JSON path such as `data.items`.
- Detects the fields from the first 100 rows: text, number, boolean and date. Nested objects are
  flattened with dots (`user.name`).
- Returns only the fields a chart asks for, and caches a response for 5 minutes.
- Explains every fixable problem in plain words (bad URL, refused key, not JSON, wrong path,
  too many rows).

## Quickstart

You need a Google account, Node.js 22 or later and `npm`.

1. **Get the code and the tools.**
   ```sh
   git clone <this repository> && cd looker-url-json-connector
   npm install -g @google/clasp
   ```
2. **Enable the Apps Script API** for your account at
   <https://script.google.com/home/usersettings>.
3. **Log in.** `clasp login` opens a browser. It stores Google credentials in `~/.clasprc.json`
   in your home directory: never copy that file into the repository.
4. **Create the Script project.**
   ```sh
   clasp create-script --type standalone --title "looker-url-json-connector"
   ```
   This writes `.clasp.json` with your script id (the file is in `.gitignore`). If the command
   offers to replace `appsscript.json`, restore the repository version with
   `git checkout appsscript.json`. To use an existing project instead, copy `.clasp.json.example`
   to `.clasp.json` and paste the script id.
5. **Push the code.** `clasp push` uploads `appsscript.json` and `src/*.js` and nothing else
   (see `.claspignore`).
6. **Get a deployment id.** Run `clasp open-script`. In the editor click **Deploy > Test
   deployments** and copy the **Head Deployment ID**. It always runs the code you pushed last,
   which is what private use needs. Do not use **Deploy > New deployment > Add-on**: that type
   is for the Google Workspace Marketplace and asks to change the Google Cloud project.
7. **Optional: a fixed version.** `clasp create-deployment` creates a versioned deployment and
   prints its id. Use it when other people rely on the data source and should not get every
   push at once.
8. **Open the connect URL** with your id at the end:
   ```
   https://lookerstudio.google.com/datasources/create?connectorId=<DEPLOYMENT_ID>
   ```
   Google's documentation writes the same link with the host `datastudio.google.com`; use that
   one if the first does not open.
9. **Authorize and enter the key.** Looker Studio first asks you to authorize the script (it
   requests one permission: connect to an external service), then asks for the key. Paste the
   API token.
10. **Enter the API URL** and the other fields from the [config reference](#config-reference),
    then click **Connect**. The detected fields appear; fix a type there if needed.
11. **Build a chart.** Click **Create report**, add a time series chart, set the date field as
    the dimension and a number field as the metric.
12. **Share.** Share the report as usual. Viewers see the data through your key (the data
    source uses the owner's credentials by default) and never see the key. A person who wants to
    create their own data source with this connector needs view access to the Script project.
13. **Refresh.** In the report click **More options > Refresh data**. The connector also keeps
    each response for 5 minutes, so a change in the API can take that long to show. To change
    how often Looker Studio itself refetches, edit the data source and click **Data freshness**.

After a code change run `clasp push`. The Head deployment picks it up at once and its id
stays the same. A versioned deployment keeps its old code until you edit it in **Deploy >
Manage deployments** and select a new version.

The steps were checked against the code and the official documentation, not run: the author of
this README had no Google account in the build environment. See "Not verified yet" in
`docs/ROADMAP.md`.

## Config reference

A blank field uses its default. Write `none` to switch an optional part off.

| Field | Default | Meaning |
| --- | --- | --- |
| API URL | (required) | `https://` only. Local, private and link-local hosts are refused. |
| Query string | empty | Extra parameters, for example `metric=dau&limit=1000`. |
| JSON path to rows | empty | Dot path to the array of rows, for example `data.items`. Empty: the response itself is the array. |
| Header name | `Authorization` | The header that carries the key. |
| Header scheme | `Bearer` for `Authorization`, nothing for other headers | The word before the key. `none` sends the bare key. |
| Start date parameter | `from` | Receives the start of the report's date range as `YYYY-MM-DD`. `none` skips it. |
| End date parameter | `to` | Receives the end of the range. `none` skips it. |
| Row limit | `50000` | A response with more rows is refused. Up to 1,000,000. |
| Timeout in seconds | `60` | How long to wait for the API. Up to 360. |
| Field types | empty | JSON that fixes field types, for example `{"day": "DATE", "id": "TEXT"}`. Types: `NUMBER`, `TEXT`, `DATE`, `BOOLEAN`. |

The key is not a config field: Looker Studio asks for it separately and the connector keeps it
in your Apps Script user properties (`docs/SECURITY.md`).

### How fields are detected

| JSON value | Looker Studio field |
| --- | --- |
| number | Number, metric, aggregation Sum |
| `true` / `false` | Boolean, dimension |
| `"2026-11-23"` or an ISO timestamp such as `"2026-11-23T10:00:00Z"` | Date (`YYYYMMDD`), dimension. The day is taken as written, the time is dropped. |
| any other string, or mixed values | Text, dimension |
| nested object | one field per leaf, named with dots: `user.name` (field id `user_name`) |
| array inside a row | refused with an error |

A number that is really an identifier (`user_id`) is detected as a metric: set it to `TEXT` in
"Field types". A field that is `null` in all of the first 100 rows is detected as text.

## Examples

**A bearer API.** `GET https://api.example.com/metrics/v1?metric=dau&from=...&to=...` returns
`[{"day": "2026-11-23", "metric": "dau", "value": 123}]`.

- API URL: `https://api.example.com/metrics/v1`
- Query string: `metric=dau`
- Everything else blank. Fields: `day` (date), `metric` (text), `value` (number).

**An API-key header.** The API expects `X-Api-Key: <key>` and takes no dates.

- API URL: `https://api.example.com/v2/orders`
- Header name: `X-Api-Key`
- Start date parameter: `none`, End date parameter: `none`

**A nested JSON.** The API returns
`{"data": {"items": [{"id": 7, "user": {"name": "Ann", "active": true}}]}}`.

- JSON path to rows: `data.items`
- Field types: `{"id": "TEXT"}`
- Fields: `id` (text), `user.name` (text), `user.active` (boolean).

## Token rotation

1. Create the new token in your API. Keep the old one valid for now.
2. In Looker Studio open the connector list (**Create > Data source**), find this connector,
   open its menu and choose **Revoke access**. This deletes the stored key.
3. Open the data source (or the connect URL) again; Looker Studio asks for the key. Paste the
   new token. If the API refuses it, the connector does not save it.
4. Revoke the old token in your API.

If the API starts refusing the stored key (HTTP 401 or 403), Looker Studio asks for a new key
by itself the next time the data source is opened.

## Known limits

- One key per Google account per deployment. For a second API with another key, create a second
  deployment (or a second Script project).
- `GET` only, one request per query, no pagination yet (design in `docs/ROADMAP.md`).
- Response size up to 20 MB and 50,000 rows by default. Looker Studio and Apps Script have their
  own limits: 6 minutes per run, 50 MB per response, a daily quota of URL fetch calls.
- Only responses under about 90 KB are cached (the Apps Script cache holds 100 KB per value).
- Filters are applied by Looker Studio after the fetch, not sent to the API.
- Timestamps become dates; hours and minutes are dropped.
- The schema comes from a sample taken at connect time over the last 28 days. If the API gains
  a field later, open the data source and click **Refresh fields**.
- The host must be a public name or IPv4 address. IPv6 literals are refused.
- Field names that differ only in punctuation (`a.b` and `a_b`) collide and are refused.

## Website

<https://looker-url-json-connector.softec.be> is built from `site/`: the connector page, support,
the privacy policy and the terms of service.

## Development

```sh
npm test
```

No dependencies: the tests use Node's built-in runner and load `src/` with small stand-ins for
the Apps Script services. See `CONTRIBUTING.md` and `docs/ARCHITECTURE.md`.

## License

Apache-2.0, see `LICENSE`. It was chosen over MIT because it adds an explicit patent grant and
is the license of Google's own example connectors, which this code follows.

Looker Studio is a trademark of Google LLC. This project is not affiliated with or endorsed by
Google.
