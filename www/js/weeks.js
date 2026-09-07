window.App = window.App || {};

App.Weeks = (function () {
  const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

  function range(a, b) {
    const out = [];
    for (let i = a; i <= b; i++) out.push(i);
    return out;
  }

  function isFull(weeks, total) {
    if (weeks.length !== total) return false;
    return weeks.every((w, i) => w === i + 1);
  }

  function detectPattern(src) {
    if (/(单周|奇数周|\(单\))/.test(src)) return 'odd';
    if (/(双周|偶数周|\(双\))/.test(src)) return 'even';
    return 'custom';
  }

  /**
   * 把 "1-16周(双)" "1-8,10-16" "3,5,7周" 展开为具体周次数组。
   * 这层刻意不交给大模型计算，避免它算错。
   */
  function parseWeeksExpr(expr, totalWeeks) {
    const totalWeeks_ = totalWeeks || 20;
    let src = String(expr || '')
      .replace(/[（(]/g, '(')
      .replace(/[）)]/g, ')')
      .replace(/[，、]/g, ',')
      .replace(/[～~—–]/g, '-')
      .replace(/\s+/g, '');

    if (!src) return { weeks: range(1, totalWeeks_), pattern: 'all' };

    const pattern = detectPattern(src);
    const cleaned = src.replace(/\((单周|双周|单|双|奇数周|偶数周)\)/g, '');
    const body = cleaned.replace(/周/g, '') || `1-${totalWeeks_}`;

    const set = new Set();
    body.split(',').forEach((part) => {
      if (!part) return;
      const m = part.match(/^(\d+)-(\d+)$/);
      if (m) {
        const a = Math.max(1, parseInt(m[1], 10));
        const b = Math.min(totalWeeks_, parseInt(m[2], 10));
        for (let i = a; i <= b; i++) set.add(i);
        return;
      }
      if (/^\d+$/.test(part)) {
        const v = parseInt(part, 10);
        if (v >= 1 && v <= totalWeeks_) set.add(v);
        return;
      }
      if (CN_NUM[part]) set.add(CN_NUM[part]);
    });

    let weeks = Array.from(set).sort((a, b) => a - b);
    if (!weeks.length) weeks = range(1, totalWeeks_);
    if (pattern === 'odd') weeks = weeks.filter((w) => w % 2 === 1);
    if (pattern === 'even') weeks = weeks.filter((w) => w % 2 === 0);

    const finalPattern = isFull(weeks, totalWeeks_) ? 'all' : pattern;
    return { weeks, pattern: finalPattern };
  }

  function describeWeeks(weeks, totalWeeks) {
    const total = totalWeeks || 20;
    if (!weeks || !weeks.length) return '无';
    if (isFull(weeks, total)) return '全周';

    const sorted = [...weeks].sort((a, b) => a - b);
    const odd = sorted.every((w) => w % 2 === 1);
    const even = sorted.every((w) => w % 2 === 0);
    if (odd || even) {
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      if (sorted.length === Math.floor((max - min) / 2) + 1) {
        return `${min}-${max}周(${odd ? '单' : '双'})`;
      }
    }

    const segs = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const w = sorted[i];
      if (w === prev + 1) {
        prev = w;
      } else {
        segs.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = w;
        prev = w;
      }
    }
    segs.push(start === prev ? `${start}` : `${start}-${prev}`);
    return segs.join(',') + '周';
  }

  const EN_DAY = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

  function parseDayOfWeek(v) {
    if (typeof v === 'number') return Math.min(7, Math.max(1, v === 0 ? 7 : v));
    const s = String(v || '').trim();

    const en = s.toLowerCase().match(/(mon|tue|wed|thu|fri|sat|sun)/);
    if (en) return EN_DAY[en[1]];

    for (const k of Object.keys(CN_NUM)) {
      if (s.indexOf(k) >= 0) return CN_NUM[k];
    }
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 7) return n;
    return 1;
  }

  return { parseWeeksExpr, describeWeeks, parseDayOfWeek };
})();
