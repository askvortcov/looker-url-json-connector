# Publishing to the connector gallery

Nothing is published or submitted. This is the checklist for the day the owner decides to.

Source: Google's official documentation, read on 2026-11-23. The pages now carry the product
name "Data Studio" and links to `datastudio.google.com`; the `/looker-studio/connector/` URLs
below still serve them. Read the pages again before submitting: the rules change.

- Requirements: <https://developers.google.com/looker-studio/connector/pscc-requirements>
- Publishing overview: <https://developers.google.com/looker-studio/connector/publish-connector>
- Manifest reference: <https://developers.google.com/looker-studio/connector/manifest>
- Authentication: <https://developers.google.com/looker-studio/connector/auth>
- Sharing an unpublished connector: <https://developers.google.com/looker-studio/connector/share>
- Direct links: <https://developers.google.com/looker-studio/connector/direct-links>

The documentation describes one publishing route, the Partner Connector review. We found no
separate route for open-source connectors: the "open source" page redirects to Google's
examples repository, <https://github.com/googledatastudio/example-connectors>.

## What Google asks

Quotes are from the requirements page unless another page is named.

### Apps Script project

- [ ] Share view access to the project with `data-studio-contrib-qa@googlegroups.com` and
      `data-studio-contrib@google.com`.
- [ ] "Create a deployment named Production and update the Production deployment to the
      version of code you intend to publish."
- [ ] The manifest is visible in the editor.

### Manifest

- [x] Explicit OAuth scopes: "Connectors without explicit OAuth scopes will be rejected." We
      declare one, `script.external_request`.
- [x] `shortDescription`, `authType`, `feeType` are set. "shortDescription cannot contain
      URLs"; its limit is 114 characters (manifest reference).
- [x] `description`: "Connectors with vague and incomplete descriptions will be rejected."
- [ ] `name`: "Limited to 28 characters" (manifest reference). "Avoid using the word connector
      in the name." "Do not use shorthand names for Data Studio anywhere in the manifest."
      The working name `looker-url-json-connector` contains "connector" and the product name,
      so it needs to change before a submission.
- [ ] `company`, `companyUrl`: placeholders today.
- [ ] `logoUrl`: "should point to a static image hosted under your control. You cannot use
      images served by Google services on domains such as *.gstatic.com, *.ggpht.com,
      *.google.com, *.googleusercontent.com. Using Google Cloud Storage to serve images from
      the *.googleapis.com domain is acceptable and is a recommended hosting option.
      Connectors with animated icons will be rejected." Size: the manifest reference says "The
      required dimensions are 40px by 40px"; the requirements page recommends "at minimum, a
      48x48-pixel image".
- [ ] `addOnUrl`: "should be a dedicated hosted page about your connector, preferably hosted on
      your own domain." "This page must contain or link to your Terms of Service and Privacy
      Policy" (manifest reference). "Hosting on https://sites.google.com/ is not allowed."
- [ ] `privacyPolicyUrl`, `termsOfServiceUrl`: on the same domain as the `addOnUrl` page.
- [ ] `supportUrl`: "This cannot be an email or mailto link."
- [ ] `sources`: optional. "Your connector will fail the review process if the sources in your
      manifest do not exist in the repository." A new source is added by a pull request to
      Google's Data Registry repository; names use uppercase letters and underscores (manifest
      reference). We set none: a generic JSON API is not one product.
- [x] `templates`: asked for connectors with a fixed schema ("If your connector has a fixed
      schema, create a report template"). Ours has no fixed schema, so there is none.
- [x] "Emojis are not allowed in any manifest field."

Fields we looked for and did not find in the manifest reference: `useHttp`. It is not in our
manifest.

### `urlFetchWhitelist`

It is optional: "A list of HTTPS URL prefixes which your connector uses. Any URL endpoint
fetched must match one of the prefixes in this list" (manifest reference). For a connector
like this one the requirements page says: "If your connector does not connect to a set of fixed
endpoints or the endpoint prefix varies, omit the urlFetchWhitelist property and provide details
in the Exception for urlFetchWhitelist form field when submitting the review request." An empty
list `[]` is for connectors that do not use `UrlFetchApp` at all, so it would be wrong here.

Finding: we omit the property, and the review request must explain that the user supplies the
endpoint.

### Authentication and behaviour

- [x] "Use authentication methods provided by getAuthType(). Do not request credentials via
      getConfig()." The key goes through `AuthType.KEY`.
- [ ] A query string that carries a secret would break the spirit of that rule. Tell users to
      put secrets in the key, not in "Query string".
- [x] User errors instead of raw exceptions; `isAdminUser()` returns false.
- [ ] "Your connector cannot be in unfinished or beta status." Finish stage 1 on real data
      first.
- [ ] "Ensure you adhere to the Data Studio Galleries Terms of Service (Submitter)."

### OAuth verification

- [ ] "The verification is mandatory for all connectors regardless of the authentication method
      in getAuthType()." "Your connector will be rejected if the OAuth Client Verification
      process is not completed." It needs a standard Google Cloud project linked to the Script
      project, a consent screen and a verified domain.

### Submitting

"Once you have met all the requirements, click the following button to request a review for
your connector: Publish your Partner Connector." The button opens a form; we did not open it.
The documentation we read does not state whether reviewers need a test account or how long a
review takes. For a generic connector, prepare a public demo API and a key for the reviewers.

## What we still lack

| Item | Needed for | State |
| --- | --- | --- |
| Final name without "connector" and without the Google product name | manifest `name` | open |
| Company or author name and URL | `company`, `companyUrl` | placeholder |
| Logo, static, not animated, at least 48x48, on a host we control | `logoUrl` | draft: `site/logo.png` (96x96), served from the website |
| Connector page on our own domain | `addOnUrl` | written: `site/index.html`; live once the website is deployed |
| Privacy policy on that domain | `privacyPolicyUrl` | written: `site/privacy/`; needs the operator's legal name and a contact |
| Terms of service on that domain | `termsOfServiceUrl` | written: `site/terms/`; needs the operator's legal name; governing law is not stated |
| Support page (not an email address) | `supportUrl` | written: `site/support/`, which sends people to GitHub issues |
| Error logging in a gallery version | privacy policy | open: with `exceptionLogging` `STACKDRIVER`, error texts (API host and path) of every user would land in the publisher's logs. Set it to `NONE` for the published version or disclose it in the privacy policy |
| Public repository | the project page, support | exists; nothing pushed by the build |
| OAuth client verification | mandatory | not started |
| "Production" deployment shared with Google's two review addresses | review | not started |
| Demo API and key for reviewers | review of a generic connector | not started |
| Text for the "Exception for urlFetchWhitelist" form field | review | draft: "The user enters the API endpoint; there is no fixed set of hosts. The connector accepts only https URLs on public hosts and does not follow redirects to another host." |

## Until then: private use

An unpublished connector is opened by its direct link,
`https://datastudio.google.com/datasources/create?connectorId=DEPLOYMENT_ID` (direct links
page). "If you do not publish your connector in the Connector Gallery, then any user of the
connector will require read access to your Apps Script project" (sharing page).
