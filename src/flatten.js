/**
 * Turns one row into a flat object: {a: {b: 1}} becomes {'a.b': 1}.
 * Arrays inside a row have no single-cell meaning, so they are refused.
 */
function flattenRow(row, rowNumber) {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    throw new UserFacingError(
      'Row ' + rowNumber + ' is ' + describeJson(row) + ', not a JSON object. ' +
      'Each row must look like {"field": value}.'
    );
  }
  var flat = {};
  flattenInto(flat, row, '', rowNumber);
  return flat;
}

function flattenInto(flat, object, prefix, rowNumber) {
  Object.keys(object).forEach(function (key) {
    var value = object[key];
    var path = prefix + key;
    if (Array.isArray(value)) {
      throw new UserFacingError(
        'The field "' + path + '" in row ' + rowNumber + ' is an array. Arrays inside a row are ' +
        'not supported: point "JSON path to rows" at that array or make the API return flat rows.'
      );
    }
    if (value !== null && typeof value === 'object') {
      flattenInto(flat, value, path + '.', rowNumber);
    } else {
      flat[path] = value;
    }
  });
}
