/** Reads and checks the data source config. Pure functions. */

var DEFAULT_ROW_LIMIT = 50000;
var MAX_ROW_LIMIT = 1000000;
var DEFAULT_TIMEOUT_SECONDS = 60;
// UrlFetchApp allows at most 360 seconds, the length of one script run.
var MAX_TIMEOUT_SECONDS = 360;
var DISABLED = 'none';

/**
 * Returns the checked settings for `request.configParams`.
 * A blank field takes its default; the word `none` switches a part off.
 */
function readSettings(configParams) {
  var p = configParams || {};
  function text(id) { return String(p[id] === undefined || p[id] === null ? '' : p[id]).trim(); }
  function optional(id, fallback) {
    var value = text(id);
    if (!value) return fallback;
    return value.toLowerCase() === DISABLED ? '' : value;
  }

  var headerName = text('headerName') || 'Authorization';
  if (!/^[A-Za-z0-9-]+$/.test(headerName)) {
    throw new UserFacingError(
      '"Header name" may contain only letters, digits and hyphens, for example X-Api-Key.'
    );
  }
  // Bearer is the default only for the Authorization header: X-Api-Key and
  // the like take the bare key.
  var scheme = optional('headerScheme', headerName.toLowerCase() === 'authorization' ? 'Bearer' : '');
  if (scheme && !/^[A-Za-z0-9._~-]+$/.test(scheme)) {
    throw new UserFacingError('"Header scheme" must be one word such as Bearer or Token, or none.');
  }

  var fromParam = optional('fromParam', 'from');
  var toParam = optional('toParam', 'to');
  [fromParam, toParam].forEach(function (name) {
    if (name && !/^[A-Za-z0-9_.\-\[\]]+$/.test(name)) {
      throw new UserFacingError(
        'A date parameter name may contain only letters, digits, "_", "-", "." and "[]".'
      );
    }
  });

  function wholeNumber(id, label, fallback, max) {
    if (!text(id)) return fallback;
    var number = Number(text(id));
    if (!(number >= 1 && number <= max && Math.floor(number) === number)) {
      throw new UserFacingError('"' + label + '" must be a whole number from 1 to ' + max + '.');
    }
    return number;
  }
  var rowLimit = wholeNumber('rowLimit', 'Row limit', DEFAULT_ROW_LIMIT, MAX_ROW_LIMIT);
  var timeoutSeconds =
    wholeNumber('timeoutSeconds', 'Timeout', DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS);

  return {
    url: validateApiUrl(p.url),
    query: text('query').replace(/^[?&]+/, ''),
    rowsPath: text('rowsPath'),
    headerName: headerName,
    scheme: scheme,
    fromParam: fromParam,
    toParam: toParam,
    rowLimit: rowLimit,
    timeoutSeconds: timeoutSeconds,
    overrides: parseOverrides(p.fieldTypes)
  };
}

/** The request headers that carry the key. */
function authHeaders(settings, key) {
  var headers = {};
  headers[settings.headerName] = settings.scheme ? settings.scheme + ' ' + key : key;
  return headers;
}

/**
 * The text a cache key is derived from: everything that changes the response
 * except the key itself. The cache is per user, so the key is not needed.
 */
function cacheKeyText(requestUrl, settings) {
  return [requestUrl, settings.headerName, settings.scheme].join('\n');
}
