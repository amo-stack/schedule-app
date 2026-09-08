window.App = window.App || {};

/**
 * 教务系统导出的课表表格 → 课程数组
 * 输入：二维数组（由 SheetJS 或 CSV 解析得到）
 * 输出：{ ok, items, term, warnings }
 *
 * 适配的典型格式（单元格内用 "/" 分隔字段，多门课用换行分隔）：
 *   课程名/(1-2节)1-17周(单)/ 一教204/吴菁菁/班级/人数
 */
App.XlsParse = (function () {
  const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };

  function s(v) {
    return String(v == null ? '' : v).trim();
  }

  /** 找到含「星期一…星期日」的表头行 */
  function findHeaderRow(cells) {
    for (let r = 0; r < Math.min(cells.length, 25); r++) {
      const row = cells[r] || [];
      let hits = 0;
      for (let c = 0; c < row.length; c++) {
        if (/(?:星期|周)\s*[一二三四五六日天]/.test(s(row[c]))) hits++;
      }
      if (hits >= 3) return r;
    }
    return -1;
  }

  /** 表头行 → { 列索引: 星期几 } */
  function mapDayColumns(headerRow) {
    const map = {};
    (headerRow || []).forEach((v, c) => {
      const m = s(v).match(/(?:星期|周)\s*([一二三四五六日天])/);
      if (m) map[c] = CN_NUM[m[1]];
    });
    return map;
  }

  /** 行首的节次标记：优先「第1-2节」，其次中文数字 一→1-2节 二→3-4节… */
  function rowSection(row, maxCol) {
    for (let c = 0; c < Math.min(maxCol, 4); c++) {
      const t = s(row[c]);
      if (!t) continue;
      const m = t.match(/第?\s*(\d{1,2})\s*[-~]\s*(\d{1,2})\s*节/);
      if (m) return { start: Math.ceil(parseInt(m[1], 10) / 2), end: Math.ceil(parseInt(m[2], 10) / 2) };
      const m2 = t.match(/第?\s*(\d{1,2})\s*节/);
      if (m2) {
        const n = Math.ceil(parseInt(m2[1], 10) / 2);
        return { start: n, end: n };
      }
      const cn = t.match(/^\s*([一二三四五])\s*$/);
      if (cn) {
        const n = CN_NUM[cn[1]];
        return { start: n, end: n };
      }
    }
    return null;
  }

  /** 从 "(1-2节)1-17周(单)" 这类片段里取周次表达式 */
  function pickWeeksExpr(seg) {
    if (!seg) return '';
    const m = String(seg).match(/\d{1,2}\s*(?:[-~]\s*\d{1,2})?\s*周\s*(?:\(\s*[单双]\s*\))?/);
    return m ? m[0] : '';
  }

  /**
   * 解析一个单元格（可能含多门课）
   * 正则匹配：名称/(1-2节)周次/地点/教师/…
   */
  function parseCell(text, day, fallback) {
    const out = [];
    const blocks = String(text || '')
      .split(/\r?\n+/)
      .map(s)
      .filter(Boolean);

    const re = /([^\/\n]+?)\/\s*\(?\s*(\d{1,2})\s*(?:[-~]\s*(\d{1,2})\s*)?节\s*\)?\s*([^\/\n]*)(?:\/\s*([^\/\n]*))?(?:\/\s*([^\/\n]*))?/;

    blocks.forEach((b) => {
      const m = b.match(re);
      if (m) {
        // 教务系统的 "1-2节" 等表示的是「大节」(每大节 90 分钟)，映射成 major 编号
        const start = Math.ceil(parseInt(m[2], 10) / 2);
        const end = Math.ceil((m[3] ? parseInt(m[3], 10) : parseInt(m[2], 10)) / 2);
        out.push({
          name: s(m[1]),
          teacher: s(m[6] || ''),
          location: s(m[5] || ''),
          dayOfWeek: day,
          startSection: start,
          endSection: end,
          weeksExpr: pickWeeksExpr(m[4]),
          confidence: 1,
          source: 'xls',
        });
        return;
      }
      // 兜底：无「/」分隔的纯文本（如「专项体育技能I(板块)」）
      if (b && fallback) {
        out.push({
          name: b.replace(/\/\/.*$/, '').trim(),
          dayOfWeek: day,
          startSection: fallback.start,
          endSection: fallback.end,
          weeksExpr: '',
          confidence: 0.5,
          source: 'xls-fallback',
        });
      }
    });
    return out;
  }

  /** 从表格注释里提取学期信息：本学期2026-09-07正式上课…共20周 */
  function pickTerm(cells) {
    const all = cells.map((r) => (r || []).map(s).join(' ')).join(' ');
    let startDate = '';
    let totalWeeks = 0;

    const d = all.match(/(\d{4})\s*[-/年]\s*(\d{1,2})\s*[-/月]\s*(\d{1,2})/);
    if (d) {
      startDate = `${d[1]}-${String(d[2]).padStart(2, '0')}-${String(d[3]).padStart(2, '0')}`;
    }
    const w = all.match(/共\s*(\d{1,2})\s*周/);
    if (w) totalWeeks = parseInt(w[1], 10);

    return startDate || totalWeeks ? { startDate, totalWeeks: totalWeeks || 20 } : null;
  }

  function parseCells(cells) {
    const warnings = [];
    if (!Array.isArray(cells) || !cells.length) return { ok: false, error: '表格为空', items: [], warnings };

    const hr = findHeaderRow(cells);
    if (hr < 0) return { ok: false, error: '没找到含「星期一…星期日」的表头行', items: [], warnings };

    const dayCols = mapDayColumns(cells[hr]);
    const colCount = Object.keys(dayCols).length;
    if (colCount < 1) return { ok: false, error: '表头里没识别出星期列', items: [], warnings };

    const items = [];
    for (let r = hr + 1; r < cells.length; r++) {
      const row = cells[r] || [];
      const sec = rowSection(row, hr >= 0 ? 4 : 3);
      if (!sec) continue;

      Object.keys(dayCols).forEach((cStr) => {
        const c = parseInt(cStr, 10);
        const raw = s(row[c]);
        if (!raw) return;
        if (/^注\s*[:：\-—]|^打印时间|^本学期/.test(raw)) return;
        parseCell(raw, dayCols[cStr], sec).forEach((it) => {
          if (it.name) items.push(it);
        });
      });
    }

    if (!items.length) return { ok: false, error: '表头找到了，但没解析出课程', items: [], warnings };

    // 没写到周次的课，标一句提醒
    const noWeek = items.filter((x) => !x.weeksExpr).length;
    if (noWeek) warnings.push(`${noWeek} 门课没标注周次，已按「全学期」处理，可在列表里改`);

    return { ok: true, items, term: pickTerm(cells), warnings };
  }

  return { parseCells, findHeaderRow, mapDayColumns, rowSection, parseCell, pickTerm };
})();
