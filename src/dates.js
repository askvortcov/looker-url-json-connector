/** Date detection and conversion. Looker Studio wants dates as YYYYMMDD. */

var DATE_OR_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

/** True for `2026-11-23` and ISO timestamps such as `2026-11-23T10:00:00Z`. */
function isDateLike(value) {
  var m = typeof value === 'string' && DATE_OR_TIMESTAMP.exec(value);
  return !!m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31;
}

/** `2026-11-23...` to `20261123`. The day is taken as written, with no time zone shift. */
function toYyyymmdd(value) {
  if (!isDateLike(value)) return null;
  return value.slice(0, 4) + value.slice(5, 7) + value.slice(8, 10);
}

/** A Date to `YYYY-MM-DD` in UTC. */
function formatDay(date) {
  return date.toISOString().slice(0, 10);
}
