'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConnector } = require('./helper');

const { app } = loadConnector(() => {
  throw new Error('pure tests must not fetch');
});
// Values made inside the connector's scope have its own Object and Array
// prototypes, so compare their JSON form.
const plain = (value) => JSON.parse(JSON.stringify(value));

test('validateApiUrl accepts a public https URL and trims it', () => {
  assert.equal(app.validateApiUrl('  https://api.example.com/v1/rows?x=1 '), 'https://api.example.com/v1/rows?x=1');
  assert.equal(app.validateApiUrl('https://8.8.8.8:8443/rows'), 'https://8.8.8.8:8443/rows');
});

test('validateApiUrl accepts https only', () => {
  assert.throws(() => app.validateApiUrl('http://api.example.com/rows'), /must start with https/);
  assert.throws(() => app.validateApiUrl('ftp://api.example.com/rows'), /not valid/);
  assert.throws(() => app.validateApiUrl('api.example.com/rows'), /not valid/);
  assert.throws(() => app.validateApiUrl(''), /Enter the API URL/);
  assert.throws(() => app.validateApiUrl('https://api.example.com/rows#top'), /not valid/);
  assert.throws(() => app.validateApiUrl('https://api.example.com/rows?x=1#top'), /not valid/);
});

test('validateApiUrl refuses credentials in the URL', () => {
  assert.throws(() => app.validateApiUrl('https://user:pass@api.example.com/'), /user name or password/);
  assert.throws(() => app.validateApiUrl('https://api.example.com@10.0.0.1/'), /user name or password/);
});

test('validateApiUrl refuses local, private and link-local hosts', () => {
  const refused = [
    'localhost', 'LOCALHOST:8080', 'api.localhost', 'printer.local', 'db.internal', 'intranet',
    '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '[::1]', '[fd00::1]',
    // Other spellings of 127.0.0.1.
    '2130706433', '0x7f.0.0.1', '0177.0.0.1', '127.1'
  ];
  for (const host of refused) {
    assert.throws(() => app.validateApiUrl('https://' + host + '/rows'), /host is not allowed/, host);
  }
});

test('validateApiUrl names IPv6 as unsupported', () => {
  assert.throws(() => app.validateApiUrl('https://[2001:db8::1]/rows'), /IPv6 addresses are not supported/);
});

test('validateApiUrl accepts public addresses next to the private ranges', () => {
  for (const host of ['172.15.0.1', '172.32.0.1', '100.63.0.1', '100.128.0.1', '169.253.1.1', '11.0.0.1', '192.167.1.1']) {
    assert.equal(app.validateApiUrl('https://' + host + '/'), 'https://' + host + '/', host);
  }
});

test('buildRequestUrl appends the query and the date range', () => {
  const settings = { url: 'https://api.example.com/m', query: 'metric=dau', fromParam: 'from', toParam: 'to' };
  const range = { startDate: '2026-11-01', endDate: '2026-11-23' };
  assert.equal(app.buildRequestUrl(settings, range), 'https://api.example.com/m?metric=dau&from=2026-11-01&to=2026-11-23');
  assert.equal(app.buildRequestUrl({ ...settings, url: 'https://api.example.com/m?a=1' }, range),
    'https://api.example.com/m?a=1&metric=dau&from=2026-11-01&to=2026-11-23');
});

test('buildRequestUrl treats each part as optional', () => {
  const range = { startDate: '2026-11-01', endDate: '2026-11-23' };
  const base = { url: 'https://api.example.com/m', query: '', fromParam: 'from', toParam: 'to' };
  assert.equal(app.buildRequestUrl({ ...base, fromParam: '' }, range), 'https://api.example.com/m?to=2026-11-23');
  assert.equal(app.buildRequestUrl({ ...base, toParam: '' }, range), 'https://api.example.com/m?from=2026-11-01');
  assert.equal(app.buildRequestUrl({ ...base, fromParam: '', toParam: '' }, range), 'https://api.example.com/m');
  assert.equal(app.buildRequestUrl(base, undefined), 'https://api.example.com/m');
  assert.equal(app.buildRequestUrl({ ...base, fromParam: 'date[gte]' }, { startDate: '2026-11-01' }),
    'https://api.example.com/m?date%5Bgte%5D=2026-11-01');
});

test('displayUrl drops the query', () => {
  assert.equal(app.displayUrl('https://api.example.com/m?secret=abc'), 'https://api.example.com/m');
});

test('resolveRedirect follows the same host only', () => {
  const from = 'https://api.example.com/v1/rows?x=1';
  assert.equal(app.resolveRedirect(from, '/v2/rows?x=1'), 'https://api.example.com/v2/rows?x=1');
  assert.equal(app.resolveRedirect(from, 'https://API.example.com/v2'), 'https://API.example.com/v2');
  for (const location of ['https://evil.example.net/v2', 'http://api.example.com/v2', '//evil.example.net/v2',
    'https://api.example.com:8443/v2', 'v2/rows', '']) {
    assert.throws(() => app.resolveRedirect(from, location), /redirects to another host/, location);
  }
});

test('extractRows returns the array at the path', () => {
  assert.deepEqual(plain(app.extractRows([{ a: 1 }], '')), [{ a: 1 }]);
  assert.deepEqual(plain(app.extractRows({ data: { items: [{ a: 1 }] } }, 'data.items')), [{ a: 1 }]);
  assert.deepEqual(plain(app.extractRows({ data: [] }, ' data ')), []);
});

test('extractRows explains a wrong path', () => {
  assert.throws(() => app.extractRows({ data: { items: [] } }, 'data.rows'), /key "rows" was not found/);
  assert.throws(() => app.extractRows({ data: [1] }, 'data.items'), /key "items" was not found/);
  assert.throws(() => app.extractRows({ data: [[{ a: 1 }]] }, 'data.0'), /key "0" was not found/);
  assert.throws(() => app.extractRows({ data: { items: {} } }, 'data.items'),
    /JSON path "data.items" is an object, not an array/);
  assert.throws(() => app.extractRows({ data: [] }, ''), /The response is an object, not an array/);
  assert.throws(() => app.extractRows(null, ''), /The response is null, not an array/);
  assert.throws(() => app.extractRows('text', ''), /The response is a string, not an array/);
});

test('flattenRow flattens nested objects with dots', () => {
  assert.deepEqual(plain(app.flattenRow({ id: 1, user: { name: 'Ann', geo: { city: 'Oslo' } }, note: null, empty: {} }, 1)),
    { id: 1, 'user.name': 'Ann', 'user.geo.city': 'Oslo', note: null });
});

test('flattenRow refuses arrays and non-object rows', () => {
  assert.throws(() => app.flattenRow({ user: { tags: ['a'] } }, 7), /field "user.tags" in row 7 is an array/);
  assert.throws(() => app.flattenRow([1, 2], 3), /Row 3 is an array, not a JSON object/);
  assert.throws(() => app.flattenRow(5, 1), /Row 1 is a number/);
  assert.throws(() => app.flattenRow(null, 1), /Row 1 is null/);
});

test('isDateLike and toYyyymmdd handle dates and ISO timestamps', () => {
  const dates = {
    '2026-11-23': '20261123',
    '2026-11-23T10:15:00Z': '20261123',
    '2026-11-23T10:15:00.123+02:00': '20261123',
    '2026-11-23T10:15': '20261123',
    '2026-11-23 10:15:00': '20261123'
  };
  for (const [input, expected] of Object.entries(dates)) {
    assert.equal(app.isDateLike(input), true, input);
    assert.equal(app.toYyyymmdd(input), expected, input);
  }
  for (const input of [['2026-11-23'], '2026-13-01', '2026-11-32', '2026-00-10', '23.11.2026', '20261123', '2026-11-23T', 'x2026-11-23', '', 20261123, null]) {
    assert.equal(app.isDateLike(input), false, String(input));
    assert.equal(app.toYyyymmdd(input), null, String(input));
  }
});

test('formatDay prints a UTC day', () => {
  assert.equal(app.formatDay(new Date(Date.UTC(2026, 10, 3, 23, 59))), '2026-11-03');
});

test('inferType picks the type shared by the non-null values', () => {
  assert.equal(app.inferType([1, 2.5, null]), 'NUMBER');
  assert.equal(app.inferType([true, false]), 'BOOLEAN');
  assert.equal(app.inferType(['2026-11-23', undefined, '2026-11-24T00:00:00Z']), 'DATE');
  assert.equal(app.inferType(['a', 'b']), 'TEXT');
  assert.equal(app.inferType(['2026-11-23', 'soon']), 'TEXT');
  assert.equal(app.inferType([1, '2']), 'TEXT');
  assert.equal(app.inferType([1, true]), 'TEXT');
  assert.equal(app.inferType(['12']), 'TEXT');
  assert.equal(app.inferType([null, undefined]), 'TEXT');
  assert.equal(app.inferType([]), 'TEXT');
});

test('parseOverrides reads the type map', () => {
  assert.deepEqual(plain(app.parseOverrides('')), {});
  assert.deepEqual(plain(app.parseOverrides(undefined)), {});
  assert.deepEqual(plain(app.parseOverrides(' {"id": "text", "value": "NUMBER"} ')), { id: 'TEXT', value: 'NUMBER' });
  assert.throws(() => app.parseOverrides('{id: TEXT}'), /not valid JSON/);
  assert.throws(() => app.parseOverrides('["TEXT"]'), /must be a JSON object/);
  assert.throws(() => app.parseOverrides('null'), /must be a JSON object/);
  assert.throws(() => app.parseOverrides('{"id": "STRING"}'), /type of "id" must be one of NUMBER, TEXT, DATE, BOOLEAN/);
});

test('inferFields keeps first-appearance order and applies overrides', () => {
  const rows = [
    { day: '2026-11-23', metric: 'dau', value: 1, 'user.id': 7 },
    { day: '2026-11-24', metric: 'dau', value: 2, 'user.id': 8, ok: true }
  ];
  assert.deepEqual(plain(app.inferFields(rows, { 'user.id': 'TEXT', later: 'NUMBER' })), [
    { id: 'day', name: 'day', type: 'DATE' },
    { id: 'metric', name: 'metric', type: 'TEXT' },
    { id: 'value', name: 'value', type: 'NUMBER' },
    { id: 'user_id', name: 'user.id', type: 'TEXT' },
    { id: 'ok', name: 'ok', type: 'BOOLEAN' },
    { id: 'later', name: 'later', type: 'NUMBER' }
  ]);
});

test('inferFields gives the same schema for the same rows and looks at the sample only', () => {
  const rows = [];
  for (let i = 0; i < 150; i++) rows.push({ a: i, b: 'x' });
  rows[120].a = 'not a number';
  rows[130].late = 1;
  const first = plain(app.inferFields(rows, {}));
  assert.deepEqual(first, [{ id: 'a', name: 'a', type: 'NUMBER' }, { id: 'b', name: 'b', type: 'TEXT' }]);
  assert.deepEqual(plain(app.inferFields(rows, {})), first);
  rows[99].a = 'text inside the sample';
  assert.equal(app.inferFields(rows, {})[0].type, 'TEXT');
});

test('inferFields refuses two fields with the same id', () => {
  assert.throws(() => app.inferFields([{ 'a.b': 1, a_b: 2 }], {}), /"a.b" and "a_b" get the same id "a_b"/);
});

test('selectFields returns the requested fields in the requested order', () => {
  const fields = [
    { id: 'day', name: 'day', type: 'DATE' },
    { id: 'metric', name: 'metric', type: 'TEXT' },
    { id: 'value', name: 'value', type: 'NUMBER' }
  ];
  assert.deepEqual(plain(app.selectFields(fields, ['value', 'day'])), [fields[2], fields[0]]);
  assert.deepEqual(plain(app.selectFields(fields, ['gone'])), [{ id: 'gone', name: 'gone', type: 'TEXT' }]);
});

test('convertValue converts by type and keeps missing values null', () => {
  const cases = [
    [null, 'NUMBER', null], [undefined, 'TEXT', null], [undefined, 'DATE', null],
    [1.5, 'NUMBER', 1.5], [0, 'NUMBER', 0], ['12.5', 'NUMBER', 12.5], ['', 'NUMBER', null],
    ['abc', 'NUMBER', null], [true, 'NUMBER', null],
    ['2026-11-23', 'DATE', '20261123'], ['2026-11-23T01:02:03Z', 'DATE', '20261123'], ['soon', 'DATE', null],
    [true, 'BOOLEAN', true], [false, 'BOOLEAN', false], ['true', 'BOOLEAN', true], ['false', 'BOOLEAN', false],
    ['yes', 'BOOLEAN', null],
    ['text', 'TEXT', 'text'], [5, 'TEXT', '5'], [false, 'TEXT', 'false'], ['', 'TEXT', '']
  ];
  for (const [value, type, expected] of cases) {
    assert.equal(app.convertValue(value, type), expected, `${JSON.stringify(value)} as ${type}`);
  }
});

test('buildRows gives one value per selected field', () => {
  const selected = [{ id: 'value', name: 'value', type: 'NUMBER' }, { id: 'user_day', name: 'user.day', type: 'DATE' }];
  const rows = [{ 'user.day': '2026-11-23', value: 3, extra: 'x' }, { value: 4 }];
  assert.deepEqual(plain(app.buildRows(rows, selected)), [{ values: [3, '20261123'] }, { values: [4, null] }]);
});

test('readSettings applies the defaults', () => {
  assert.deepEqual(plain(app.readSettings({ url: 'https://api.example.com/m' })), {
    url: 'https://api.example.com/m', query: '', rowsPath: '', headerName: 'Authorization', scheme: 'Bearer',
    fromParam: 'from', toParam: 'to', rowLimit: 50000, timeoutSeconds: 60, overrides: {}
  });
});

test('readSettings reads every field', () => {
  assert.deepEqual(plain(app.readSettings({
    url: 'https://api.example.com/m', query: '?metric=dau', rowsPath: ' data.items ', headerName: 'X-Api-Key',
    headerScheme: '', fromParam: 'since', toParam: 'none', rowLimit: '10', timeoutSeconds: '5',
    fieldTypes: '{"id":"TEXT"}'
  })), {
    url: 'https://api.example.com/m', query: 'metric=dau', rowsPath: 'data.items', headerName: 'X-Api-Key', scheme: '',
    fromParam: 'since', toParam: '', rowLimit: 10, timeoutSeconds: 5, overrides: { id: 'TEXT' }
  });
  const url = 'https://api.example.com/m';
  assert.equal(app.readSettings({ url, headerScheme: 'None' }).scheme, '');
  assert.equal(app.readSettings({ url, headerName: 'X-Token', headerScheme: 'Token' }).scheme, 'Token');
  assert.equal(app.readSettings({ url, fromParam: 'NONE' }).fromParam, '');
});

test('readSettings refuses bad values', () => {
  const url = 'https://api.example.com/m';
  assert.throws(() => app.readSettings(undefined), /Enter the API URL/);
  assert.throws(() => app.readSettings({ url: 'http://api.example.com' }), /must start with https/);
  assert.throws(() => app.readSettings({ url, headerName: 'X Key' }), /Header name/);
  assert.throws(() => app.readSettings({ url, headerName: 'X-Key\r\nHost: evil' }), /Header name/);
  assert.throws(() => app.readSettings({ url, headerScheme: 'Bearer x' }), /Header scheme/);
  assert.throws(() => app.readSettings({ url, fromParam: 'a=b' }), /date parameter name/);
  assert.throws(() => app.readSettings({ url, toParam: 'a&b' }), /date parameter name/);
  for (const rowLimit of ['0', '-5', '1.5', 'many', '1000001']) {
    assert.throws(() => app.readSettings({ url, rowLimit }), /"Row limit" must be a whole number/, rowLimit);
  }
  for (const timeoutSeconds of ['0', '361', 'soon']) {
    assert.throws(() => app.readSettings({ url, timeoutSeconds }), /"Timeout" must be a whole number from 1 to 360/, timeoutSeconds);
  }
  assert.throws(() => app.readSettings({ url, fieldTypes: '{' }), /not valid JSON/);
});

test('authHeaders builds the key header', () => {
  assert.deepEqual(plain(app.authHeaders({ headerName: 'Authorization', scheme: 'Bearer' }, 'k1')), { Authorization: 'Bearer k1' });
  assert.deepEqual(plain(app.authHeaders({ headerName: 'X-Api-Key', scheme: '' }, 'k1')), { 'X-Api-Key': 'k1' });
});

test('cacheKeyText depends on the URL and the header settings only', () => {
  const settings = { headerName: 'Authorization', scheme: 'Bearer' };
  const text = app.cacheKeyText('https://api.example.com/m?from=2026-11-01', settings);
  assert.notEqual(text, app.cacheKeyText('https://api.example.com/m?from=2026-11-02', settings));
  assert.notEqual(text, app.cacheKeyText('https://api.example.com/m?from=2026-11-01', { ...settings, scheme: 'Token' }));
  assert.notEqual(text, app.cacheKeyText('https://api.example.com/m?from=2026-11-01', { ...settings, headerName: 'X-Key' }));
});
