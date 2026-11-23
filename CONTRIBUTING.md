# Contributing

Thank you for helping. The project stays small on purpose: one connector, no build step, no
runtime dependencies.

## Ground rules

- Everything in the repository is English.
- Never commit a key, a token, a script id, `.clasp.json` or `.clasprc.json`. Use made-up hosts
  such as `api.example.com` in tests and docs.
- One change, one branch, one pull request. Commit messages follow
  [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`...).

## Code

- Apps Script loads every file of `src/` into one global scope. Keep top-level code to function
  and constant declarations, and do not use `import`, `require` or `module.exports` there.
- Logic that needs no Apps Script service goes into a pure function in its own file. Only
  `fetch.js`, `auth.js` and `main.js` touch `UrlFetchApp`, `CacheService`, `PropertiesService`
  and `DataStudioApp`.
- A problem the user can fix throws `UserFacingError` with a message that says what to change.
  A message never contains the key, a query string or the text of a caught exception.

## Tests

```sh
npm test
```

Every behaviour has a test. Check a new test by mutation: break the code it covers, see the
test go red, restore the code. A test that stays green against broken code is not a test.

## Pull requests

Fill in the template: what and why, the test output, what to check by hand in Looker Studio.
CI runs the tests and a secret scan on every pull request.
