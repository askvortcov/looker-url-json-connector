/**
 * Key authentication, after Google's KEY example:
 * https://developers.google.com/looker-studio/connector/auth#key
 * The key is kept in the user properties of the person who entered it.
 */

var KEY_PROPERTY = 'dscc.key';
// The last request URL and header settings that worked for this user. The
// auth functions get no config, so this is what a new key is checked against.
var ENDPOINT_PROPERTY = 'connector.endpoint';
var AUTH_OK_CACHE = 'auth-ok';
var AUTH_CHECK_TIMEOUT_SECONDS = 30;

function getAuthType() {
  var cc = DataStudioApp.createCommunityConnector();
  return cc.newAuthTypeResponse().setAuthType(cc.AuthType.KEY).build();
}

function storedKey() {
  return PropertiesService.getUserProperties().getProperty(KEY_PROPERTY);
}

function resetAuth() {
  var properties = PropertiesService.getUserProperties();
  properties.deleteProperty(KEY_PROPERTY);
  properties.deleteProperty(ENDPOINT_PROPERTY);
  CacheService.getUserCache().remove(AUTH_OK_CACHE);
}

function isAuthValid() {
  var key = storedKey();
  if (!key) return false;
  var cache = CacheService.getUserCache();
  if (cache.get(AUTH_OK_CACHE)) return true;
  if (!keyIsAccepted(key)) return false;
  cache.put(AUTH_OK_CACHE, '1', CACHE_TTL_SECONDS);
  return true;
}

function setCredentials(request) {
  var key = String((request && request.key) || '').trim();
  if (!key || !keyIsAccepted(key)) return { errorCode: 'INVALID_CREDENTIALS' };
  PropertiesService.getUserProperties().setProperty(KEY_PROPERTY, key);
  CacheService.getUserCache().remove(AUTH_OK_CACHE);
  return { errorCode: 'NONE' };
}

/**
 * Sends a real request to the remembered endpoint and reports whether the API
 * accepts the key. Only 401 and 403 mean "no": an outage or a missing
 * endpoint must not lock the user out of the data source.
 */
function keyIsAccepted(key) {
  var saved = PropertiesService.getUserProperties().getProperty(ENDPOINT_PROPERTY);
  if (!saved) return true;
  try {
    var endpoint = JSON.parse(saved);
    var code = httpGet(endpoint.url, authHeaders(endpoint, key), AUTH_CHECK_TIMEOUT_SECONDS)
      .getResponseCode();
    return code !== 401 && code !== 403;
  } catch (e) {
    return true;
  }
}

function rememberEndpoint(requestUrl, settings) {
  PropertiesService.getUserProperties().setProperty(ENDPOINT_PROPERTY, JSON.stringify({
    url: requestUrl,
    headerName: settings.headerName,
    scheme: settings.scheme
  }));
}
