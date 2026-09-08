window.App = window.App || {};

App.Store = (function () {
  const K_COURSES = 'schedule.courses';
  const K_SETTINGS = 'schedule.settings';
  const K_TERM = 'schedule.term';
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
    return read(K_COURSES, []);
  }

  function setCourses(list) {
    write(K_COURSES, list);
  }

  function upsertCourse(c) {
    const list = getCourses();
    const i = list.findIndex((x) => x.id === c.id);
    if (i >= 0) list[i] = c;
    else list.push(c);
    setCourses(list);
  }

  function deleteCourse(id) {
    setCourses(getCourses().filter((c) => c.id !== id));
  }

  function clearCourses() {
    setCourses([]);
  }

  // 课程唯一签名：课名 + 星期 + 起止节次 + 周次。用于去重判定
  function courseSig(c) {
    const w = (c.weeks || []).slice().sort((a, b) => a - b).join(',');
    return [c.name, c.dayOfWeek, c.startSection, c.endSection, w].join('|');
  }

  // 去掉完全重复的课程（同签名只保留第一门），返回移除数量
  function dedupeCourses() {
    const list = getCourses();
    const seen = new Set();
    const out = [];
    let removed = 0;
    list.forEach((c) => {
      const sig = courseSig(c);
      if (seen.has(sig)) { removed++; return; }
      seen.add(sig);
      out.push(c);
    });
    if (removed) setCourses(out);
    return removed;
  }

  function getSettings() {
    return Object.assign(defaultSettings(), read(K_SETTINGS, {}));
  }

  function setSettings(s) {
    write(K_SETTINGS, s);
  }

  function getTerm() {
    return Object.assign(defaultTerm(), read(K_TERM, {}));
  }

  function setTerm(t) {
    write(K_TERM, t);
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
    getExams,
    setExams,
    upsertExam,
    deleteExam,
    newId,
    colorFor,
  };
})();
