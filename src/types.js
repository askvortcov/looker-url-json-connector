/** Schema inference: which fields the rows have and what type each one is. */

var FIELD_TYPES = ['NUMBER', 'TEXT', 'DATE', 'BOOLEAN'];
var SAMPLE_ROWS = 100;

/** The type shared by all non-null values, TEXT when they disagree or are absent. */
function inferType(values) {
  var present = values.filter(function (v) { return v !== null && v !== undefined; });
  if (!present.length) return 'TEXT';
  function all(test) { return present.every(test); }
  if (all(function (v) { return typeof v === 'boolean'; })) return 'BOOLEAN';
  if (all(function (v) { return typeof v === 'number'; })) return 'NUMBER';
  if (all(isDateLike)) return 'DATE';
  return 'TEXT';
}

/** Parses the optional override `{"field": "NUMBER|TEXT|DATE|BOOLEAN"}`. */
function parseOverrides(text) {
  text = String(text || '').trim();
  if (!text) return {};
  var hint = ' Use JSON like {"day": "DATE", "value": "NUMBER"}.';
  var parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new UserFacingError('"Field types" is not valid JSON.' + hint);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new UserFacingError('"Field types" must be a JSON object.' + hint);
  }
  var overrides = {};
  Object.keys(parsed).forEach(function (name) {
    var type = String(parsed[name]).toUpperCase();
    if (FIELD_TYPES.indexOf(type) < 0) {
      throw new UserFacingError(
        '"Field types": the type of "' + name + '" must be one of ' + FIELD_TYPES.join(', ') + '.'
      );
    }
    overrides[name] = type;
  });
  return overrides;
}

/** Looker Studio field ids allow only letters, digits and underscores. */
function fieldId(path) {
  return path.replace(/[^A-Za-z0-9_]/g, '_');
}

/**
 * Returns [{id, name, type}] for flat rows. `name` is the dotted path in the
 * row. Fields keep the order of first appearance; overridden fields that the
 * sample lacks come last, so a schema exists even for an empty response.
 */
function inferFields(flatRows, overrides) {
  var sample = flatRows.slice(0, SAMPLE_ROWS);
  var names = [];
  var seen = {};
  function add(name) {
    if (!seen[name]) {
      seen[name] = true;
      names.push(name);
    }
  }
  sample.forEach(function (row) { Object.keys(row).forEach(add); });
  Object.keys(overrides).forEach(add);

  var ids = {};
  return names.map(function (name) {
    var id = fieldId(name);
    if (ids[id]) {
      throw new UserFacingError(
        'The fields "' + ids[id] + '" and "' + name + '" get the same id "' + id + '". ' +
        'Rename one of them in the API.'
      );
    }
    ids[id] = name;
    var type = overrides[name] ||
      inferType(sample.map(function (row) { return row[name]; }));
    return { id: id, name: name, type: type };
  });
}
