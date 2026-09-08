window.App = window.App || {};

App.Store = (function () {
  const K_COURSES = 'schedule.courses';
  const K_SETTINGS = 'schedule.settings';
  const K_TERM = 'schedule.term';
  const K_EXAMS = 'schedule.exams';

  const DEFAULT_SECTIONS = [
    { index: 1, start: '08:00', end: '08:45' },
    { index: 2, start: '08:55', end: '09:40' },
    { index: 3, start: '10:00', end: '10:45' },
    { index: 4, start: '10:55', end: '11:40' },
    { index: 5, start: '14:00', end: '14:45' },
    { index: 6, start: '14:55', end: '15:40' },
    { index: 7, start: '16:00', end: '16:45' },
    { index: 8, start: '16:55', end: '17:40' },
    { index: 9, start: '19:00', end: '19:45' },
    { index: 10, start: '19:55', end: '20:40' },
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
      endRemindMin: 5,
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
