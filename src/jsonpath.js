/**
 * Returns the array of rows found at a dot path such as `data.items`.
 * An empty path means the response itself is the array.
 */
function extractRows(data, path) {
  var keys = String(path || '').trim().split('.').filter(function (k) { return k !== ''; });
  var value = data;
  for (var i = 0; i < keys.length; i++) {
    if (value === null || typeof value !== 'object' || Array.isArray(value) || !(keys[i] in value)) {
      throw new UserFacingError(
        'JSON path "' + keys.join('.') + '": the key "' + keys[i] + '" was not found in the ' +
        'response. Fix the "JSON path to rows" field.'
      );
    }
    value = value[keys[i]];
  }
  if (!Array.isArray(value)) {
    var where = keys.length ? 'The value at JSON path "' + keys.join('.') + '"' : 'The response';
    throw new UserFacingError(
      where + ' is ' + describeJson(value) + ', not an array of rows. ' +
      'Set "JSON path to rows" to the key that holds the array, for example data.items.'
    );
  }
  return value;
}

function describeJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'object' ? 'an object' : 'a ' + typeof value;
}
