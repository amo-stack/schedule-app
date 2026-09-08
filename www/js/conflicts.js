window.App = window.App || {};

App.Conflicts = (function () {
  function toMin(hhmm) {
    const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
  }

  function timeOverlap(a, b) {
    const as = toMin(a.startTime);
    const ae = toMin(a.endTime);
    const bs = toMin(b.startTime);
    const be = toMin(b.endTime);
    if (as < 0 || ae < 0 || bs < 0 || be < 0) return false;
    return as < be && bs < ae;
  }

  function intersect(wa, wb) {
    const set = new Set(wb || []);
    return (wa || []).filter((w) => set.has(w)).sort((x, y) => x - y);
  }

  function weekOverlap(a, b) {
    const wa = a.weeks || [];
    const wb = b.weeks || [];
    if (!wa.length || !wb.length) return true; // 未填周次视为全周，保守判定为冲突
    return intersect(wa, wb).length > 0;
  }

  function find(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!a || !b) continue;
        if (a.dayOfWeek !== b.dayOfWeek) continue;
        if (!timeOverlap(a, b)) continue;
        if (!weekOverlap(a, b)) continue;
        out.push({ i, j, day: a.dayOfWeek, weeks: intersect(a.weeks || [], b.weeks || []) });
      }
    }
    return out;
  }

  function describeWeeks(weeks) {
    if (!weeks || !weeks.length) return '周次未填';
    const s = [...weeks].sort((a, b) => a - b);
    const parts = [];
    let start = s[0];
    let prev = s[0];
    for (let k = 1; k <= s.length; k++) {
      if (s[k] === prev + 1) { prev = s[k]; continue; }
      parts.push(start === prev ? String(start) : `${start}-${prev}`);
      start = prev = s[k];
    }
    return parts.join(',') + ' 周';
  }

  return { find, timeOverlap, weekOverlap, intersect, describeWeeks, toMin };
})();

if (typeof window !== 'undefined') window.Conflicts = App.Conflicts;
