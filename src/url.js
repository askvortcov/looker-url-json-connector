/** URL validation and building. Pure functions, no Apps Script services. */

var HTTPS_URL = /^https:\/\/([^\/?#]+)([^?#]*)(\?[^#]*)?$/i;

/**
 * Checks the API URL from the config and returns it trimmed.
 * Only public https hosts are allowed.
 */
function validateApiUrl(text) {
  var url = String(text || '').trim();
  if (!url) {
    throw new UserFacingError('Enter the API URL, for example https://api.example.com/v1/rows.');
  }
  if (/^http:/i.test(url)) {
    throw new UserFacingError('The API URL must start with https://. Plain http is not allowed.');
  }
  var match = HTTPS_URL.exec(url);
  if (!match) {
    throw new UserFacingError(
      'The API URL is not valid. Use the form https://host/path, without a # part.'
    );
  }
  var authority = match[1].toLowerCase();
  if (authority.indexOf('@') >= 0) {
    throw new UserFacingError('The API URL must not contain a user name or password.');
  }
  var hostAndPort = /^(.*?)(?::(\d+))?$/.exec(authority);
  var reason = blockedHostReason(hostAndPort[1]);
  if (reason) {
    throw new UserFacingError('The API URL host is not allowed: ' + reason + '.');
  }
  return url;
}

/** Returns why a host is refused, or '' when it is a public host name or address. */
function blockedHostReason(host) {
  host = String(host).toLowerCase().replace(/\.$/, '');
  if (!host) return 'the host is empty';
  if (host.charAt(0) === '[' || host.indexOf(':') >= 0) return 'IPv6 addresses are not supported';

  var labels = host.split('.');
  var last = labels[labels.length - 1];
  if (!/^[a-z]/.test(last)) {
    // Looks like an address: accept only a plain dotted quad, so that
    // 2130706433, 0x7f.0.0.1 or 010.0.0.1 cannot stand in for a private one.
    if (!/^([1-9]?\d|1\d\d|2[0-4]\d|25[0-5])(\.([1-9]?\d|1\d\d|2[0-4]\d|25[0-5])){3}$/.test(host)) {
      return 'it is not a host name or a plain IPv4 address';
    }
    return isPrivateIpv4(labels.map(Number)) ? 'private, loopback and link-local addresses are refused' : '';
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
    return 'use a full public host name such as api.example.com';
  }
  if (/(^|\.)(localhost|local|internal)$/.test(host)) {
    return 'local and internal host names are refused';
  }
  return '';
}

function isPrivateIpv4(p) {
  return (
    p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && p[1] === 168) ||
    p[0] >= 224
  );
}

/**
 * Appends the configured query string and the date range to the API URL.
 * `range` is {startDate, endDate} in YYYY-MM-DD; a missing part is skipped.
 */
function buildRequestUrl(settings, range) {
  var parts = [];
  if (settings.query) parts.push(settings.query);
  range = range || {};
  if (settings.fromParam && range.startDate) {
    parts.push(encodeURIComponent(settings.fromParam) + '=' + encodeURIComponent(range.startDate));
  }
  if (settings.toParam && range.endDate) {
    parts.push(encodeURIComponent(settings.toParam) + '=' + encodeURIComponent(range.endDate));
  }
  if (!parts.length) return settings.url;
  return settings.url + (settings.url.indexOf('?') >= 0 ? '&' : '?') + parts.join('&');
}

/** The URL without its query, safe for messages: query values may be secrets. */
function displayUrl(url) {
  return String(url).split('?')[0];
}

function authorityOf(url) {
  var match = HTTPS_URL.exec(url);
  return match ? match[1].toLowerCase() : '';
}

/**
 * Returns the URL to follow for a redirect, or throws when it leaves the host.
 * Only same-host https targets and absolute paths are followed.
 */
function resolveRedirect(currentUrl, location) {
  location = String(location || '').trim();
  var target = '';
  if (/^\/(?!\/)/.test(location)) {
    target = 'https://' + authorityOf(currentUrl) + location;
  } else if (authorityOf(location) === authorityOf(currentUrl)) {
    target = location;
  }
  if (!target) {
    throw new UserFacingError(
      'The API at ' + displayUrl(currentUrl) + ' redirects to another host or to a non-https ' +
      'address. The connector does not follow such redirects: enter the final URL.'
    );
  }
  return target;
}
