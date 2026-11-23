/**
 * Looker Studio Community Connector entry points.
 * https://developers.google.com/looker-studio/connector/build
 */

var SCHEMA_SAMPLE_DAYS = 28;

/** Debug output stays off for everyone: errors show only the user message. */
function isAdminUser() {
  return false;
}

function getConfig() {
  var cc = DataStudioApp.createCommunityConnector();
  var config = cc.getConfig();

  config.newInfo().setId('intro').setText(
    'Reads rows from an HTTPS JSON API. The key you entered is sent in a request header. ' +
    'A blank field uses its default; write none to switch an optional part off.'
  );
  function input(id, name, help, placeholder) {
    config.newTextInput().setId(id).setName(name).setHelpText(help).setPlaceholder(placeholder);
  }
  input('url', 'API URL', 'https only. Example: https://api.example.com/v1/metrics',
    'https://api.example.com/v1/metrics');
  input('query', 'Query string (optional)', 'Extra query parameters, for example metric=dau&limit=1000',
    'metric=dau');
  input('rowsPath', 'JSON path to rows (optional)',
    'Dot path to the array of rows, for example data.items. Blank: the response is the array.',
    'data.items');
  input('headerName', 'Header name (optional)', 'Header that carries the key. Default: Authorization',
    'Authorization');
  input('headerScheme', 'Header scheme (optional)',
    'Word before the key. Default: Bearer for Authorization, nothing for other headers. ' +
    'Write none to send the bare key.', 'Bearer');
  input('fromParam', 'Start date parameter (optional)',
    'Query parameter that receives the range start as YYYY-MM-DD. Default: from. Write none to skip it.',
    'from');
  input('toParam', 'End date parameter (optional)',
    'Query parameter that receives the range end as YYYY-MM-DD. Default: to. Write none to skip it.',
    'to');
  input('rowLimit', 'Row limit (optional)',
    'A response with more rows is refused. Default: ' + DEFAULT_ROW_LIMIT, String(DEFAULT_ROW_LIMIT));
  input('timeoutSeconds', 'Timeout in seconds (optional)',
    'How long to wait for the API. Default: ' + DEFAULT_TIMEOUT_SECONDS,
    String(DEFAULT_TIMEOUT_SECONDS));
  config.newTextArea().setId('fieldTypes').setName('Field types (optional)')
    .setHelpText('JSON that fixes the type of a field: NUMBER, TEXT, DATE or BOOLEAN.')
    .setPlaceholder('{"day": "DATE", "value": "NUMBER"}');

  config.setDateRangeRequired(true);
  return config.build();
}

function getSchema(request) {
  return withUserErrors(function () {
    var settings = readSettings(request.configParams);
    var end = new Date();
    var start = new Date(end.getTime() - SCHEMA_SAMPLE_DAYS * 24 * 60 * 60 * 1000);
    var range = { startDate: formatDay(start), endDate: formatDay(end) };

    var loaded = loadRows(settings, range);
    rememberEndpoint(loaded.requestUrl, settings);
    var fields = inferFields(loaded.rows, settings.overrides);
    if (!fields.length) {
      throw new UserFacingError(
        'The API returned no rows for the last ' + SCHEMA_SAMPLE_DAYS + ' days, so the fields ' +
        'cannot be detected. List them in "Field types", for example {"day": "DATE", "value": "NUMBER"}.'
      );
    }
    return { schema: buildSchema(fields) };
  });
}

function getData(request) {
  return withUserErrors(function () {
    var settings = readSettings(request.configParams);
    var loaded = loadRows(settings, request.dateRange);
    var requestedIds = (request.fields || []).map(function (field) { return field.name; });
    var selected = selectFields(inferFields(loaded.rows, settings.overrides), requestedIds);
    return {
      schema: buildSchema(selected),
      rows: buildRows(loaded.rows, selected),
      filtersApplied: false
    };
  });
}

/** One fetch: returns {requestUrl, rows} with the rows flattened. */
function loadRows(settings, range) {
  var requestUrl = buildRequestUrl(settings, range);
  var data;
  try {
    data = fetchJson(requestUrl, settings, storedKey());
  } catch (e) {
    // A refused key must be asked for again, not trusted from the cache.
    CacheService.getUserCache().remove(AUTH_OK_CACHE);
    throw e;
  }
  var rows = extractRows(data, settings.rowsPath);
  if (rows.length > settings.rowLimit) {
    throw new UserFacingError(
      'The API returned ' + rows.length + ' rows, over the limit of ' + settings.rowLimit + '. ' +
      'Narrow the date range, add a filter to the query string or raise "Row limit".'
    );
  }
  return {
    requestUrl: requestUrl,
    rows: rows.map(function (row, index) { return flattenRow(row, index + 1); })
  };
}

/** Maps [{id, name, type}] to Looker Studio fields. */
function buildSchema(fieldList) {
  var cc = DataStudioApp.createCommunityConnector();
  var fields = cc.getFields();
  fieldList.forEach(function (field) {
    if (field.type === 'NUMBER') {
      fields.newMetric().setId(field.id).setName(field.name)
        .setType(cc.FieldType.NUMBER).setAggregation(cc.AggregationType.SUM);
    } else {
      var type = cc.FieldType.TEXT;
      if (field.type === 'DATE') type = cc.FieldType.YEAR_MONTH_DAY;
      if (field.type === 'BOOLEAN') type = cc.FieldType.BOOLEAN;
      fields.newDimension().setId(field.id).setName(field.name).setType(type);
    }
  });
  return fields.build();
}

/** Runs an entry point and shows every failure as a Looker Studio user error. */
function withUserErrors(run) {
  try {
    return run();
  } catch (e) {
    var text = e && e.isUserFacing
      ? e.message
      : 'Unexpected connector error (' + ((e && e.name) || 'Error') + '). Please report it to the connector maintainers.';
    DataStudioApp.createCommunityConnector().newUserError().setText(text).throwException();
  }
}
