window.App = window.App || {};

App.Store = (function () {
  const K_COURSES = 'schedule.courses';   // 现为 { [termId]: Course[] }，按学期分桶
  const K_SETTINGS = 'schedule.settings';
  const K_TERM = 'schedule.term';          // 仅用于旧数据迁移
  const K_TERMS = 'schedule.terms';         // Term[]
  const K_ACTIVE_TERM = 'schedule.activeTerm';
  const K_EXAMS = 'schedule.exams';

  // 大学课表按「大节」计，每大节 90 分钟（1.5 小时）；时间按用户学校实际作息
  const DEFAULT_SECTIONS = [
    { index: 1, start: '08:30', end: '10:00' },
    { index: 2, start: '10:20', end: '11:50' },
    { index: 3, start: '14:30', end: '16:00' },
    { index: 4, start: '16:20', end: '17:50' },
    { index: 5, start: '19:00', end: '20:30' },
  ];

  const COLORS = ['#6366F1', '#10B981', '#F59E0B', '#A855F7', '#F43F5E', '#06B6D4', '#8B5CF6', '#F97316'];

  const REMIND_OPTIONS = [0, 5, 10, 20, 30, 60];

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('write failed', e);
    }
  }

  function defaultTerm() {
    const monday = App.Term.mondayOf(new Date());
    return {
      name: '本学期',
      startDate: App.Term.toISODate(App.Term.addDays(monday, -7)),
      totalWeeks: 20,
    };
  }

  function defaultSettings() {
    return {
      defaultRemindMin: 20,
      theme: 'auto',
      visionProvider: 'off',
      apiKey: '',
      apiBase: '',
      model: '',
      sectionTimes: DEFAULT_SECTIONS,
      adjustments: { holidays: [], makeup: [] },
      remindBringBook: true,
      endRemindMin: 0,
      autoSilence: true,
    };
  }

  function getCourses() {
    const map = read(K_COURSES, {});
    if (Array.isArray(map)) return map; // 旧格式兼容
    const id = getActiveTermId();
    return (id && map[id]) || [];
  }

  function setCourses(list) {
    const map = read(K_COURSES, {});
    const safe = Array.isArray(map) ? {} : map;
    const id = getActiveTermId();
    if (!id) return;
    safe[id] = list;
    write(K_COURSES, safe);
  }

  function upsertCourse(c) {
    const id = getActiveTermId();
    if (!id) return;
    const map = read(K_COURSES, {});
    const safe = Array.isArray(map) ? {} : map;
    const list = safe[id] || [];
    c.termId = id;
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c;
    else list.push(c);
    safe[id] = list;
    write(K_COURSES, safe);
  }

  function deleteCourse(id) {
    const aid = getActiveTermId();
    if (!aid) return;
    const map = read(K_COURSES, {});
    const safe = Array.isArray(map) ? {} : map;
    safe[aid] = (safe[aid] || []).filter((c) => c.id !== id);
    write(K_COURSES, safe);
  }

  function clearCourses() {
    const aid = getActiveTermId();
    const map = read(K_COURSES, {});
    const safe = Array.isArray(map) ? {} : map;
    if (aid) safe[aid] = [];
    write(K_COURSES, safe);
  }

  // 课程唯一签名：课名 + 星期 + 起止节次 + 周次。用于去重判定
  function courseSig(c) {
    const w = (c.weeks || []).slice().sort((a, b) => a - b).join(',');
    return [c.name, c.dayOfWeek, c.startSection, c.endSection, w].join('|');
  }

  // 去掉完全重复的课程（同签名只保留第一门），返回移除数量
  function dedupeCourses() {
    const aid = getActiveTermId();
    const map = read(K_COURSES, {});
    const safe = Array.isArray(map) ? {} : map;
    const list = safe[aid] || [];
    const seen = new Set();
    const out = [];
    let removed = 0;
    list.forEach((c) => {
      const sig = courseSig(c);
      if (seen.has(sig)) { removed++; return; }
      seen.add(sig);
      out.push(c);
    });
    if (removed) safe[aid] = out;
    write(K_COURSES, safe);
    return removed;
  }

  function getSettings() {
    return Object.assign(defaultSettings(), read(K_SETTINGS, {}));
  }

  function setSettings(s) {
    write(K_SETTINGS, s);
  }

  function getTerms() {
    let list = read(K_TERMS, null);
    if (!list || !list.length) {
      const oldTerm = read(K_TERM, null);
      const base = oldTerm ? Object.assign(defaultTerm(), oldTerm) : defaultTerm();
      const id = 't_' + Date.now();
      base.id = id;
      list = [base];
      write(K_TERMS, list);
      const oldCourses = read(K_COURSES, []);
      if (Array.isArray(oldCourses)) {
        const map = {};
        map[id] = oldCourses.map((c) => Object.assign({}, c, { termId: id }));
        write(K_COURSES, map);
      }
      write(K_ACTIVE_TERM, id);
      try { localStorage.removeItem(K_TERM); } catch (e) {}
    }
    return list;
  }

  function getActiveTermId() {
    return read(K_ACTIVE_TERM, null) || (getTerms()[0] && getTerms()[0].id) || null;
  }

  function getActiveTerm() {
    const list = getTerms();
    const id = read(K_ACTIVE_TERM, null) || (list[0] && list[0].id);
    return list.find((t) => t.id === id) || list[0];
  }

  function getTerm() {
    return getActiveTerm();
  }

  function setTerm(t) {
    updateTerm(t);
  }

  function setActiveTermId(id) {
    write(K_ACTIVE_TERM, id);
  }

  function addTerm(t) {
    const list = getTerms();
    const id = 't_' + Date.now();
    t.id = id;
    list.push(t);
    write(K_TERMS, list);
    return id;
  }

  function updateTerm(t) {
    const list = getTerms();
    const i = list.findIndex((x) => x.id === t.id);
    if (i >= 0) list[i] = t;
    else list.push(t);
    write(K_TERMS, list);
  }

  function deleteTerm(id) {
    const list = getTerms().filter((x) => x.id !== id);
    write(K_TERMS, list);
    const map = read(K_COURSES, {});
    const safe = Array.isArray(map) ? {} : map;
    if (safe[id]) { delete safe[id]; write(K_COURSES, safe); }
    if (read(K_ACTIVE_TERM, null) === id) {
      write(K_ACTIVE_TERM, list.length ? list[0].id : null);
    }
  }

  /* ---------- 考试 ---------- */

  function getExams() {
    return read(K_EXAMS, []);
  }

  function setExams(list) {
    write(K_EXAMS, list);
  }

  function upsertExam(e) {
    const list = getExams();
    const i = list.findIndex((x) => x.id === e.id);
    if (i >= 0) list[i] = e;
    else list.push(e);
    setExams(list);
  }

  function deleteExam(id) {
    setExams(getExams().filter((x) => x.id !== id));
  }

  function newId() {
    return 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  }

  function colorFor(name) {
    let h = 0;
    for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0;
    return COLORS[h % COLORS.length];
  }

  return {
    DEFAULT_SECTIONS,
    COLORS,
    REMIND_OPTIONS,
    getCourses,
    setCourses,
    upsertCourse,
    deleteCourse,
    clearCourses,
    courseSig,
    dedupeCourses,
    getSettings,
    setSettings,
    getTerm,
    setTerm,
    getTerms,
    getActiveTerm,
    getActiveTermId,
    setActiveTermId,
    addTerm,
    updateTerm,
    deleteTerm,
    getExams,
    setExams,
    upsertExam,
    deleteExam,
    newId,
    colorFor,
  };
})();
