/** HTTP access: one GET with the key header, manual redirects, limits and a short cache. */

var MAX_RESPONSE_CHARS = 20 * 1000 * 1000;
var MAX_REDIRECTS = 3;
var CACHE_TTL_SECONDS = 300;
// CacheService stores at most 100 KB per value; larger responses are not cached.
var CACHE_MAX_CHARS = 90000;

/** One GET without following redirects. Returns the response or throws a user error. */
function httpGet(url, headers, timeoutSeconds) {
  try {
    return UrlFetchApp.fetch(url, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true,
      followRedirects: false,
      timeoutSeconds: timeoutSeconds
    });
  } catch (e) {
    // The exception text may hold the full URL with its query: do not pass it on.
    throw new UserFacingError(
      'Could not reach ' + displayUrl(url) + ': the request failed or took longer than ' +
      timeoutSeconds + ' seconds. Check the URL and that the API answers from the public internet.'
    );
  }
}

/** Returns the response body of `url`, following only same-host redirects. */
function fetchText(url, headers, timeoutSeconds) {
  for (var hop = 0; hop <= MAX_REDIRECTS; hop++) {
    var response = httpGet(url, headers, timeoutSeconds);
    var code = response.getResponseCode();
    if (code >= 300 && code < 400) {
      url = resolveRedirect(url, headerValue(response.getHeaders(), 'location'));
      continue;
    }
    if (code < 200 || code >= 300) throw new UserFacingError(httpErrorText(code, url));
    var text = response.getContentText();
    if (text.length > MAX_RESPONSE_CHARS) {
      throw new UserFacingError(
        'The response from ' + displayUrl(url) + ' is larger than ' +
        MAX_RESPONSE_CHARS / 1000000 + ' MB. Narrow the date range or add a filter to the query.'
      );
    }
    return text;
  }
  throw new UserFacingError(
    'The API at ' + displayUrl(url) + ' redirects more than ' + MAX_REDIRECTS +
    ' times. Enter the final URL.'
  );
}

function headerValue(headers, name) {
  var found = '';
  Object.keys(headers || {}).forEach(function (key) {
    if (key.toLowerCase() === name) found = headers[key];
  });
  return found;
}

function httpErrorText(code, url) {
  var where = displayUrl(url);
  if (code === 401 || code === 403) {
    return 'The API at ' + where + ' refused the key (HTTP ' + code + '). Check the key, ' +
      '"Header name" and "Header scheme". For a new key, reconnect the data source to ' +
      'update the credentials.';
  }
  if (code === 404) return 'The API URL ' + where + ' was not found (HTTP 404). Check the URL.';
  if (code === 429) return 'The API at ' + where + ' is rate limiting requests (HTTP 429). Try again later.';
  return 'The API at ' + where + ' answered HTTP ' + code + '. Check the URL and the query string.';
}

function cacheKey(requestUrl, settings) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    cacheKeyText(requestUrl, settings),
    Utilities.Charset.UTF_8
  );
  return 'rows:' + Utilities.base64Encode(digest);
}

/** Fetches and parses the JSON at `requestUrl`, through the per-user cache. */
function fetchJson(requestUrl, settings, key) {
  var cache = CacheService.getUserCache();
  var name = cacheKey(requestUrl, settings);
  var text = cache.get(name);
  if (text === null || text === undefined) {
    text = fetchText(requestUrl, authHeaders(settings, key), settings.timeoutSeconds);
    if (text.length <= CACHE_MAX_CHARS) {
      try {
        cache.put(name, text, CACHE_TTL_SECONDS);
      } catch (e) {
        // Caching is an optimisation: a value over the size limit is simply not cached.
      }
    }
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new UserFacingError(
      'The response from ' + displayUrl(requestUrl) + ' is not JSON. ' +
      'Check that the URL is the API endpoint and not a web page.'
    );
  }
}
