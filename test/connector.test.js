'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConnector, response } = require('./helper');

const TOKEN = 'test-token-value';
const URL = 'https://api.example.com/metrics/v1';
const METRICS = [
  { day: '2026-11-22', metric: 'dau', value: 120 },
  { day: '2026-11-23', metric: 'dau', value: 123 }
];
const RANGE = { startDate: '2026-11-01', endDate: '2026-11-23' };
const plain = (value) => JSON.parse(JSON.stringify(value));

/** A connector with a stored key whose API answers with `fetch` (or the metrics rows). */
function connector(fetch) {
  const loaded = loadConnector(fetch || (() => response(200, METRICS)));
  loaded.userProperties.setProperty('dscc.key', TOKEN);
  return loaded;
}

function dataRequest(configParams, fieldNames) {
  return { configParams, dateRange: RANGE, fields: fieldNames.map((name) => ({ name })) };
}

/** Runs `run` and returns the text of the Looker Studio user error it throws. */
function userError(run) {
  try {
    run();
  } catch (error) {
    assert.equal(error.isLookerUserError, true, 'expected a user error, got: ' + error.stack);
    return error.message;
  }
  assert.fail('expected a user error');
}

test('getAuthType asks for a key and isAdminUser keeps debug output off', () => {
  const { app } = connector();
  assert.deepEqual(plain(app.getAuthType()), { type: 'KEY' });
  assert.equal(app.isAdminUser(), false);
});

test('getConfig lists the fields and requires a date range', () => {
  const config = connector().app.getConfig();
  assert.equal(config.dateRangeRequired, true);
  assert.deepEqual(config.configParams.filter((p) => p.kind !== 'INFO').map((p) => p.id), [
    'url', 'query', 'rowsPath', 'headerName', 'headerScheme', 'fromParam', 'toParam', 'rowLimit',
    'timeoutSeconds', 'fieldTypes'
  ]);
  for (const param of config.configParams.filter((p) => p.kind !== 'INFO')) {
    assert.ok(param.name && param.helpText, param.id);
  }
});

test('getSchema infers the fields of the metrics API', () => {
  const { app, calls } = connector();
  const { schema } = app.getSchema({ configParams: { url: URL, query: 'metric=dau' } });
  assert.deepEqual(plain(schema), [
    { concept: 'DIMENSION', id: 'day', name: 'day', type: 'YEAR_MONTH_DAY' },
    { concept: 'DIMENSION', id: 'metric', name: 'metric', type: 'TEXT' },
    { concept: 'METRIC', id: 'value', name: 'value', type: 'NUMBER', aggregation: 'SUM' }
  ]);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/api\.example\.com\/metrics\/v1\?metric=dau&from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d$/);
});

test('the request carries the key header, a timeout and no automatic redirects', () => {
  const { app, calls } = connector();
  app.getSchema({ configParams: { url: URL, timeoutSeconds: '15' } });
  assert.deepEqual(plain(calls[0].params), {
    method: 'get',
    headers: { Authorization: 'Bearer ' + TOKEN },
    muteHttpExceptions: true,
    followRedirects: false,
    timeoutSeconds: 15
  });
});

test('a custom header carries the bare key', () => {
  const { app, calls } = connector();
  app.getSchema({ configParams: { url: URL, headerName: 'X-Api-Key' } });
  assert.deepEqual(plain(calls[0].params.headers), { 'X-Api-Key': TOKEN });
});

test('getSchema flattens nested objects and reads boolean fields', () => {
  const body = { data: { items: [{ id: 1, user: { name: 'Ann', active: true } }] } };
  const { app } = connector(() => response(200, body));
  const { schema } = app.getSchema({ configParams: { url: URL, rowsPath: 'data.items', fieldTypes: '{"id":"TEXT"}' } });
  assert.deepEqual(plain(schema), [
    { concept: 'DIMENSION', id: 'id', name: 'id', type: 'TEXT' },
    { concept: 'DIMENSION', id: 'user_name', name: 'user.name', type: 'TEXT' },
    { concept: 'DIMENSION', id: 'user_active', name: 'user.active', type: 'BOOLEAN' }
  ]);
});

test('getSchema returns the same schema on every call', () => {
  const { app } = connector();
  const request = { configParams: { url: URL } };
  assert.deepEqual(plain(app.getSchema(request)), plain(app.getSchema(request)));
});

test('getSchema explains an empty response and accepts declared fields instead', () => {
  const { app } = connector(() => response(200, []));
  assert.match(userError(() => app.getSchema({ configParams: { url: URL } })), /returned no rows .* "Field types"/);
  const { schema } = app.getSchema({ configParams: { url: URL, fieldTypes: '{"day":"DATE","value":"NUMBER"}' } });
  assert.deepEqual(plain(schema).map((f) => f.id + ':' + f.type), ['day:YEAR_MONTH_DAY', 'value:NUMBER']);
});

test('getData returns only the requested fields in the requested order', () => {
  const { app, calls } = connector();
  const result = app.getData(dataRequest({ url: URL, query: 'metric=dau' }, ['value', 'day']));
  assert.deepEqual(plain(result), {
    schema: [
      { concept: 'METRIC', id: 'value', name: 'value', type: 'NUMBER', aggregation: 'SUM' },
      { concept: 'DIMENSION', id: 'day', name: 'day', type: 'YEAR_MONTH_DAY' }
    ],
    rows: [{ values: [120, '20261122'] }, { values: [123, '20261123'] }],
    filtersApplied: false
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, URL + '?metric=dau&from=2026-11-01&to=2026-11-23');
});

test('getData uses the configured date parameter names', () => {
  const { app, calls } = connector();
  app.getData(dataRequest({ url: URL, fromParam: 'since', toParam: 'none' }, ['day']));
  assert.equal(calls[0].url, URL + '?since=2026-11-01');
});

test('getData gives null for a missing value and for a field the response lacks', () => {
  const body = [{ day: '2026-11-23', user: { name: 'Ann' } }, { day: null }];
  const { app } = connector(() => response(200, body));
  const result = app.getData(dataRequest({ url: URL }, ['user_name', 'day', 'gone']));
  assert.deepEqual(plain(result.rows), [{ values: ['Ann', '20261123', null] }, { values: [null, null, null] }]);
});

test('getData returns no rows for an empty response', () => {
  const { app } = connector(() => response(200, { data: [] }));
  const result = app.getData(dataRequest({ url: URL, rowsPath: 'data' }, ['day', 'value']));
  assert.deepEqual(plain(result.rows), []);
  assert.equal(result.schema.length, 2);
});

test('repeated getData calls for the same range fetch once', () => {
  const { app, calls } = connector();
  const request = dataRequest({ url: URL }, ['value']);
  assert.deepEqual(plain(app.getData(request)), plain(app.getData(request)));
  assert.equal(calls.length, 1);
  app.getData({ ...request, dateRange: { startDate: '2026-10-01', endDate: '2026-10-31' } });
  assert.equal(calls.length, 2);
});

test('the cache key and the cached value never contain the key', () => {
  const first = connector();
  first.app.getData(dataRequest({ url: URL, query: 'metric=dau' }, ['value']));
  const names = [...first.userCache.map.keys()];
  assert.equal(names.length, 1);
  assert.match(names[0], /^rows:[A-Za-z0-9+\/=]{44}$/);
  assert.ok(names[0].length <= 250);
  for (const [name, value] of first.userCache.map) {
    assert.ok(!name.includes(TOKEN) && !String(value).includes(TOKEN));
  }
  // Another key gives the same cache name: the key is not an input at all.
  const second = connector();
  second.userProperties.setProperty('dscc.key', 'another-token');
  second.app.getData(dataRequest({ url: URL, query: 'metric=dau' }, ['value']));
  assert.deepEqual([...second.userCache.map.keys()], names);
});

test('a response over the cache size is served without caching', () => {
  const rows = Array.from({ length: 4000 }, (_, i) => ({ day: '2026-11-23', label: 'row number ' + i }));
  const { app, calls, userCache } = connector(() => response(200, rows));
  assert.equal(app.getData(dataRequest({ url: URL }, ['label'])).rows.length, 4000);
  app.getData(dataRequest({ url: URL }, ['label']));
  assert.equal(calls.length, 2);
  assert.equal(userCache.map.size, 0);
});

test('401 and 403 say to check the key', () => {
  for (const code of [401, 403]) {
    const { app } = connector(() => response(code, { error: 'no' }));
    const text = userError(() => app.getData(dataRequest({ url: URL, query: 'api_secret=s3cr3t' }, ['value'])));
    assert.match(text, new RegExp('refused the key \\(HTTP ' + code + '\\)'));
    assert.match(text, /update the credentials/);
  }
});

test('other HTTP errors name the status', () => {
  const texts = { 404: /not found \(HTTP 404\)/, 429: /rate limiting requests \(HTTP 429\)/, 500: /answered HTTP 500/ };
  for (const [code, pattern] of Object.entries(texts)) {
    const { app } = connector(() => response(Number(code), 'oops'));
    assert.match(userError(() => app.getSchema({ configParams: { url: URL } })), pattern);
  }
});

test('a response that is not JSON is explained', () => {
  const { app } = connector(() => response(200, '<html>Sign in</html>'));
  assert.match(userError(() => app.getSchema({ configParams: { url: URL } })), /is not JSON/);
});

test('a wrong JSON path is explained', () => {
  const { app } = connector(() => response(200, { data: { items: METRICS } }));
  assert.match(userError(() => app.getSchema({ configParams: { url: URL } })), /The response is an object, not an array/);
  assert.match(userError(() => app.getSchema({ configParams: { url: URL, rowsPath: 'data.rows' } })), /key "rows" was not found/);
  assert.match(userError(() => app.getData(dataRequest({ url: URL, rowsPath: 'data' }, ['day']))), /is an object, not an array/);
});

test('an array inside a row is refused with a clear message', () => {
  const { app } = connector(() => response(200, [{ id: 1, tags: ['a', 'b'] }]));
  assert.match(userError(() => app.getSchema({ configParams: { url: URL } })), /field "tags" in row 1 is an array/);
});

test('a bad URL is refused before any request', () => {
  for (const url of ['http://api.example.com/m', 'https://localhost/m', 'https://192.168.0.10/m', 'https://169.254.169.254/latest', '']) {
    const { app, calls } = connector();
    userError(() => app.getSchema({ configParams: { url } }));
    userError(() => app.getData(dataRequest({ url }, ['day'])));
    assert.equal(calls.length, 0, url);
  }
  assert.match(userError(() => connector().app.getSchema({})), /Enter the API URL/);
});

test('more rows than the limit are refused', () => {
  const { app } = connector();
  const text = userError(() => app.getData(dataRequest({ url: URL, rowLimit: '1' }, ['day'])));
  assert.match(text, /returned 2 rows, over the limit of 1/);
  assert.equal(app.getData(dataRequest({ url: URL, rowLimit: '2' }, ['day'])).rows.length, 2);
});

test('the default row limit is 50,000', () => {
  const rows = (count) => '[' + '{"v":1},'.repeat(count - 1) + '{"v":1}]';
  assert.equal(connector(() => response(200, rows(50000))).app.getData(dataRequest({ url: URL }, ['v'])).rows.length, 50000);
  const text = userError(() => connector(() => response(200, rows(50001))).app.getData(dataRequest({ url: URL }, ['v'])));
  assert.match(text, /returned 50001 rows, over the limit of 50000/);
});

test('a huge response is refused by size before parsing', () => {
  const { app } = connector(() => response(200, '[' + ' '.repeat(20 * 1000 * 1000) + ']'));
  assert.match(userError(() => app.getData(dataRequest({ url: URL }, ['day']))), /larger than 20 MB/);
  const atLimit = connector(() => response(200, '[' + ' '.repeat(20 * 1000 * 1000 - 2) + ']'));
  assert.deepEqual(plain(atLimit.app.getData(dataRequest({ url: URL }, ['day'])).rows), []);
});

test('a failed or timed out request is explained without the exception text', () => {
  const { app } = connector((url) => {
    throw new Error('Timeout: ' + url);
  });
  const text = userError(() => app.getData(dataRequest({ url: URL, query: 'api_secret=s3cr3t', timeoutSeconds: '7' }, ['day'])));
  assert.match(text, /Could not reach https:\/\/api\.example\.com\/metrics\/v1: .* longer than 7 seconds/);
  assert.ok(!text.includes('s3cr3t') && !text.includes('Timeout:'));
});

test('a redirect to another host is not followed', () => {
  for (const location of ['https://evil.example.net/steal', 'http://api.example.com/metrics/v1', '//evil.example.net/x']) {
    const { app, calls } = connector(() => response(302, '', { Location: location }));
    assert.match(userError(() => app.getData(dataRequest({ url: URL }, ['day']))), /redirects to another host/);
    assert.equal(calls.length, 1, location);
  }
});

test('a redirect on the same host is followed with the key', () => {
  const { app, calls } = connector((url) =>
    url.includes('/v1') ? response(301, '', { location: '/metrics/v2?metric=dau' }) : response(200, METRICS));
  assert.equal(app.getData(dataRequest({ url: URL }, ['day'])).rows.length, 2);
  assert.deepEqual(calls.map((c) => c.url), [URL + '?from=2026-11-01&to=2026-11-23', 'https://api.example.com/metrics/v2?metric=dau']);
  assert.equal(calls[1].params.followRedirects, false);
});

test('a redirect loop stops after three hops', () => {
  const { app, calls } = connector(() => response(302, '', { Location: '/metrics/v1' }));
  assert.match(userError(() => app.getData(dataRequest({ url: URL }, ['day']))), /redirects more than 3 times/);
  assert.equal(calls.length, 4);
});

test('no error text contains the key or a query value', () => {
  const failures = [
    () => response(401, 'no'), () => response(500, 'no'), () => response(200, 'not json'),
    () => response(200, { rows: [] }), () => response(302, '', { Location: 'https://evil.example.net/' }),
    () => response(200, [{ a: [1] }]), () => { throw new Error('DNS error: ' + URL + '?api_secret=s3cr3t ' + TOKEN); }
  ];
  for (const fetch of failures) {
    const { app } = connector(fetch);
    const text = userError(() => app.getData(dataRequest({ url: URL, query: 'api_secret=s3cr3t' }, ['day'])));
    assert.ok(!text.includes(TOKEN) && !text.includes('s3cr3t') && !text.includes('?'), text);
  }
});

test('an unexpected failure becomes a generic user error', () => {
  const { app } = connector();
  const text = userError(() => app.getData({ configParams: { url: URL }, dateRange: RANGE, fields: [{}, null] }));
  assert.match(text, /^Unexpected connector error \(TypeError\)/);
});

test('isAuthValid is false without a key and true with one before any endpoint is known', () => {
  const { app, calls, userProperties } = loadConnector(() => response(200, METRICS));
  assert.equal(app.isAuthValid(), false);
  userProperties.setProperty('dscc.key', TOKEN);
  assert.equal(app.isAuthValid(), true);
  assert.equal(calls.length, 0);
});

test('isAuthValid sends a real request to the endpoint the schema was read from', () => {
  let code = 200;
  const { app, calls, userCache } = connector(() => response(code, METRICS));
  app.getSchema({ configParams: { url: URL, query: 'metric=dau', headerName: 'X-Api-Key' } });
  assert.equal(app.isAuthValid(), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, calls[0].url);
  assert.deepEqual(plain(calls[1].params.headers), { 'X-Api-Key': TOKEN });
  assert.equal(calls[1].params.followRedirects, false);

  assert.equal(app.isAuthValid(), true);
  assert.equal(calls.length, 2, 'a recent positive check is reused');

  userCache.remove('auth-ok');
  code = 401;
  assert.equal(app.isAuthValid(), false);
  code = 403;
  assert.equal(app.isAuthValid(), false);
  code = 500;
  assert.equal(app.isAuthValid(), true, 'an outage is not a bad key');
});

test('a refused key in getData makes the next isAuthValid check again', () => {
  let code = 200;
  const { app, userCache } = connector(() => response(code, METRICS));
  app.getSchema({ configParams: { url: URL } });
  assert.equal(app.isAuthValid(), true);
  code = 401;
  userCache.map.forEach((_, name) => name.startsWith('rows:') && userCache.remove(name));
  userError(() => app.getData(dataRequest({ url: URL }, ['day'])));
  assert.equal(app.isAuthValid(), false);
});

test('setCredentials stores an accepted key and refuses a rejected or empty one', () => {
  const { app, userProperties, userCache } = connector((url, params) =>
    response(params.headers.Authorization === 'Bearer new-key' ? 200 : 401, METRICS));
  userProperties.setProperty('dscc.key', 'new-key');
  app.getSchema({ configParams: { url: URL } });
  userCache.put('auth-ok', '1');

  assert.deepEqual(plain(app.setCredentials({ key: 'wrong-key' })), { errorCode: 'INVALID_CREDENTIALS' });
  assert.equal(userProperties.getProperty('dscc.key'), 'new-key');
  assert.deepEqual(plain(app.setCredentials({ key: '  ' })), { errorCode: 'INVALID_CREDENTIALS' });
  assert.deepEqual(plain(app.setCredentials({})), { errorCode: 'INVALID_CREDENTIALS' });

  userProperties.deleteProperty('dscc.key');
  assert.deepEqual(plain(app.setCredentials({ key: ' new-key ' })), { errorCode: 'NONE' });
  assert.equal(userProperties.getProperty('dscc.key'), 'new-key');
  assert.equal(userCache.get('auth-ok'), null);
});

test('setCredentials accepts the first key, before any endpoint is known', () => {
  const { app, calls, userProperties } = loadConnector(() => response(401, ''));
  assert.deepEqual(plain(app.setCredentials({ key: '' })), { errorCode: 'INVALID_CREDENTIALS' });
  assert.equal(userProperties.getProperty('dscc.key'), null);
  assert.deepEqual(plain(app.setCredentials({ key: TOKEN })), { errorCode: 'NONE' });
  assert.equal(userProperties.getProperty('dscc.key'), TOKEN);
  assert.equal(calls.length, 0);
});

test('the key is stored only in the user properties, never in the cache or the endpoint', () => {
  const { app, userProperties, userCache } = connector();
  app.getSchema({ configParams: { url: URL } });
  app.getData(dataRequest({ url: URL }, ['day']));
  app.isAuthValid();
  const holders = [...userProperties.map].filter(([, value]) => String(value).includes(TOKEN)).map(([name]) => name);
  assert.deepEqual(holders, ['dscc.key']);
  for (const [name, value] of userCache.map) assert.ok(!name.includes(TOKEN) && !String(value).includes(TOKEN));
});

test('resetAuth removes the key, the endpoint and the cached check', () => {
  const { app, userProperties, userCache } = connector();
  app.getSchema({ configParams: { url: URL } });
  app.isAuthValid();
  app.resetAuth();
  assert.equal(userProperties.map.size, 0);
  assert.equal(userCache.get('auth-ok'), null);
  assert.equal(app.isAuthValid(), false);
});
