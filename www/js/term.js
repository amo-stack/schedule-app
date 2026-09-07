window.App = window.App || {};

App.Term = (function () {
  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function isoDay(d) {
    const v = d.getDay();
    return v === 0 ? 7 : v;
  }

  function mondayOf(d) {
    return addDays(startOfDay(d), -(isoDay(d) - 1));
  }

  function parseDate(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return startOfDay(new Date());
  }

  function toISODate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function currentWeekOf(startDate, totalWeeks) {
    const start = mondayOf(parseDate(startDate));
    const now = mondayOf(new Date());
    const diff = Math.round((now - start) / 86400000 / 7) + 1;
    if (diff < 1) return 0;
    return Math.min(diff, totalWeeks);
  }

  function dateOfTermWeek(startDate, week, dayOfWeek) {
    return addDays(mondayOf(parseDate(startDate)), (week - 1) * 7 + (dayOfWeek - 1));
  }

  function combineDateTime(day, hhmm) {
    const m = String(hhmm || '00:00').match(/(\d{1,2}):(\d{2})/);
    const d = new Date(day);
    d.setHours(m ? parseInt(m[1], 10) : 0, m ? parseInt(m[2], 10) : 0, 0, 0);
    return d;
  }

  return { startOfDay, addDays, isoDay, mondayOf, parseDate, toISODate, currentWeekOf, dateOfTermWeek, combineDateTime };
})();
