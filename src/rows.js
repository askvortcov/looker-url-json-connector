/** Field selection and row building for getData. */

/**
 * Returns the fields for the requested ids, in the requested order. A field
 * the current response lacks stays in the result as TEXT, so its cells are
 * null instead of the whole chart failing.
 */
function selectFields(fields, requestedIds) {
  var byId = {};
  fields.forEach(function (field) { byId[field.id] = field; });
  return requestedIds.map(function (id) {
    return byId[id] || { id: id, name: id, type: 'TEXT' };
  });
}

/** Converts a JSON value to what Looker Studio expects for the type. Missing is null. */
function convertValue(value, type) {
  if (value === null || value === undefined) return null;
  if (type === 'NUMBER') {
    if (typeof value === 'number') return isFinite(value) ? value : null;
    if (typeof value !== 'string' || value.trim() === '') return null;
    var number = Number(value);
    return isFinite(number) ? number : null;
  }
  if (type === 'BOOLEAN') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  }
  if (type === 'DATE') return toYyyymmdd(value);
  return String(value);
}

/** Returns [{values: [...]}] with one value per selected field. */
function buildRows(flatRows, selectedFields) {
  return flatRows.map(function (row) {
    return {
      values: selectedFields.map(function (field) {
        return convertValue(row[field.name], field.type);
      })
    };
  });
}
