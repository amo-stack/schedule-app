window.App = window.App || {};

(function () {
  const Store = App.Store;
  const Weeks = App.Weeks;
  const Term = App.Term;
  const Scheduler = App.Scheduler;
  const Vision = App.Vision;

  const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

  let _mediaWatcher = null;
  function applyTheme() {
    const pref = (state.settings.theme || 'auto');
    const sys = window.matchMedia('(prefers-color-scheme: dark)');
    const isDark = pref === 'dark' || (pref === 'auto' && sys.matches);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#0B1020' : '#4F46E5');
    if (!_mediaWatcher && pref === 'auto') {
      _mediaWatcher = sys;
      sys.addEventListener('change', () => { if ((state.settings.theme || 'auto') === 'auto') applyTheme(); });
    }
  }

  const state = {
    page: 'home',
    viewMode: 'week',
    tab: 'schedule',
    week: 1,
    day: new Date().getDay() === 0 ? 7 : new Date().getDay(),
    editingId: null,
    editing: null,
    examEditingId: null,
    results: [],
    selected: new Set(),
    expanded: -1,
    importMode: 'sheet',
    term: Store.getTerm(),
    settings: Store.getSettings(),
    courses: Store.getCourses(),
  };

  // 数据 schema 版本：数据结构/解析规则有重大变更时递增，用于提示用户重新导入
  const APP_SCHEMA_VERSION = 19;

  const $ = (id) => document.getElementById(id);

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function reload() {
    state.term = Store.getTerm();
    state.settings = Store.getSettings();
    state.courses = Store.getCourses();
  }

  function refreshWeek() {
    const w = Term.currentWeekOf(state.term.startDate, state.term.totalWeeks);
    state.week = w > 0 ? w : 1;
  }

  /* ---------- 页面切换 ---------- */

  function showPage(name) {
    state.page = name;
    ['viewHome', 'viewImport', 'viewCourse', 'viewSettings'].forEach((id) => {
      $(id).hidden = true;
    });
    $('btnSettings').hidden = name !== 'home';
    $('btnBack').hidden = name === 'home';
    $('btnSave').hidden = name !== 'course';

    if (name === 'home') {
      $('pageTitle').textContent = '课程表';
      $('viewHome').hidden = false;
      renderHome();
    } else if (name === 'import') {
      $('pageTitle').textContent = '导入课表';
      $('viewImport').hidden = false;
      renderImport();
    } else if (name === 'course') {
      $('pageTitle').textContent = state.editingId === 'new' ? '添加课程' : '编辑课程';
      $('viewCourse').hidden = false;
      renderCourse();
    } else if (name === 'settings') {
      $('pageTitle').textContent = '设置';
      $('viewSettings').hidden = false;
      renderSettings();
    }
  }

  /* ---------- 底部 Tab 切换 ---------- */

  function setTab(t) {
    state.tab = t;
    const schedViews = ['viewHome', 'viewImport', 'viewCourse', 'viewSettings'];
    if (t === 'exam') {
      schedViews.forEach((id) => ($(id).hidden = true));
      $('fabImport').hidden = true;
      $('fabAdd').hidden = true;
      $('btnSettings').hidden = true;
      $('btnBack').hidden = false;
      $('btnSave').hidden = true;
      $('pageTitle').textContent = '考试';
      $('tabExam').classList.add('active');
      $('tabSchedule').classList.remove('active');
      state.examEditingId = null;
      state.page = 'home';
      $('viewExam').hidden = false;
      $('viewExamEdit').hidden = true;
      renderExam();
    } else {
      $('tabSchedule').classList.add('active');
      $('tabExam').classList.remove('active');
      showPage(state.page || 'home');
    }
  }

  let lastBackAt = 0;

  // 统一的返回处理：考试编辑→考试列表→课程表主页→退出 App
  function handleBack() {
    // 1. 考试编辑中 → 回考试列表
    if (state.tab === 'exam' && !$('viewExamEdit').hidden) {
      state.examEditingId = null;
      $('viewExamEdit').hidden = true;
      $('viewExam').hidden = false;
      $('btnSave').hidden = true;
      renderExam();
      return;
    }
    // 2. 在设置/课程/导入子页 → 回课程表主页
    if (state.tab === 'schedule' && state.page !== 'home') {
      showPage('home');
      return;
    }
    // 3. 在考试列表页 → 回课程表主页
    if (state.tab === 'exam') {
      setTab('schedule');
      return;
    }
    // 4. 已在课程表主页 → 防误触，2 秒内再按一次才退出
    const now = Date.now();
    if (now - lastBackAt < 2000) {
      try { Capacitor.App.exitApp(); } catch (e) {}
    } else {
      lastBackAt = now;
      toast('再按一次退出');
    }
  }

  function onSave() {
    if (state.tab === 'exam' && state.examEditingId !== undefined) saveExam();
    else saveCourse();
  }

  /* ---------- 首页 ---------- */

  function adjSets() {
    const a = (Store.getSettings().adjustments) || { holidays: [], makeup: [] };
    const holidaySet = new Set(a.holidays || []);
    const makeupMap = {};
    (a.makeup || []).forEach((m) => { makeupMap[m.date] = m; });
    return { holidaySet, makeupMap, raw: a };
  }

  function renderHome() {
    reload();
    const courses = state.courses;
    const empty = courses.length === 0;

    $('emptyState').hidden = !empty;
    $('fabImport').hidden = empty;
    $('gridWrap').hidden = empty || state.viewMode !== 'week';
    $('dayWrap').hidden = empty || state.viewMode !== 'day';

    $('weekLabel').textContent = `第 ${state.week} 周` + (state.week === Term.currentWeekOf(state.term.startDate, state.term.totalWeeks) ? '（本周）' : '');
    $('weekDate').textContent = Term.toISODate(Term.dateOfTermWeek(state.term.startDate, state.week, 1)) + ' 起';

    if (empty) {
      $('conflictBar').hidden = true;
      $('versionBanner').hidden = true;
      return;
    }

    renderVersionBanner();
    renderConflictBar();
    renderExamWidget();

    if (state.viewMode === 'week') renderGrid();
    else renderDay();
  }

  /* 首页：最近考试倒计时 */
  function renderExamWidget() {
    const w = $('examWidget');
    const e = nearestExam();
    if (!e) { w.hidden = true; return; }
    w.hidden = false;
    w.innerHTML = `
      <div class="ew-left">
        <div class="ew-label">最近考试</div>
        <div class="ew-name"></div>
        <div class="ew-meta"></div>
      </div>
      <div class="ew-count"></div>`;
    w.querySelector('.ew-name').textContent = e.subject;
    w.querySelector('.ew-meta').textContent = `${e.examDate}${e.examTime ? ' ' + e.examTime : ''} · ${e.location || '地点未填'}`;
    w.querySelector('.ew-count').textContent = examCountdown(e);
    w.onclick = () => setTab('exam');
  }

  function nearestExam() {
    const now = Date.now();
    return Store.getExams()
      .filter((e) => new Date(e.examDate + 'T' + (e.examTime || '23:59')).getTime() >= now - 86400000)
      .sort((a, b) => new Date(a.examDate + 'T' + (a.examTime || '00:00')) - new Date(b.examDate + 'T' + (b.examTime || '00:00')))[0] || null;
  }

  function examCountdown(e) {
    const target = new Date(e.examDate + 'T' + (e.examTime || '23:59'));
    const diff = target - new Date();
    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days} 天后`;
    if (hrs > 0) return `${hrs} 小时 ${mins} 分后`;
    return `${mins} 分后`;
  }

  function renderConflictBar() {
    const bar = $('conflictBar');
    const list = Conflicts.find(state.courses);
    if (!list.length) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.innerHTML = '';
    const dot = document.createElement('span');
    dot.className = 'dot';
    const txt = document.createElement('span');
    txt.textContent = `检测到 ${list.length} 处课程时间冲突`;
    const more = document.createElement('span');
    more.className = 'more';
    more.textContent = '查看 ›';
    bar.appendChild(dot);
    bar.appendChild(txt);
    bar.appendChild(more);
    bar.onclick = () => showPage('settings');
  }

  function renderVersionBanner() {
    const box = $('versionBanner');
    if (!box) return;
    const stored = localStorage.getItem('schedule.schemaVersion');
    const courses = Store.getCourses();
    if (stored === String(APP_SCHEMA_VERSION) || !courses.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    box.innerHTML = '';
    const txt = document.createElement('span');
    txt.textContent = '检测到课表数据来自旧版本，日期可能错位。建议清空后重新导入 xls。';
    const btn = document.createElement('button');
    btn.textContent = '立即修复';
    btn.className = 'primary sm';
    btn.onclick = () => {
      Store.clearCourses();
      localStorage.removeItem('schedule.schemaVersion');
      renderVersionBanner();
      showPage('import');
      toast('已清空旧课，请重新导入 xls');
    };
    box.appendChild(txt);
    box.appendChild(btn);
  }

  function markSchemaCurrent() {
    try { localStorage.setItem('schedule.schemaVersion', String(APP_SCHEMA_VERSION)); } catch (e) {}
  }

  function renderConflictList() {
    const box = $('conflictList');
    const list = Conflicts.find(state.courses);
    box.innerHTML = '';
    if (!list.length) {
      const p = document.createElement('p');
      p.className = 'conflict-none';
      p.textContent = state.courses.length ? '没有冲突' : '还没有课程';
      box.appendChild(p);
      return;
    }
    list.forEach((cf) => {
      const a = state.courses[cf.i];
      const b = state.courses[cf.j];
      const el = document.createElement('div');
      el.className = 'conflict-item';
      const h = document.createElement('div');
      h.className = 'ci-head';
      h.textContent = `周${WEEK_LABELS[a.dayOfWeek - 1]} ${a.startTime}-${a.endTime}`;
      const d = document.createElement('div');
      d.className = 'ci-body';
      d.textContent = `${a.name} ↔ ${b.name} · ${Conflicts.describeWeeks(cf.weeks)}`;
      el.appendChild(h);
      el.appendChild(d);
      el.onclick = () => openCourse(a.id);
      box.appendChild(el);
    });
  }

  function renderGridHead() {
    const head = $('gridHead');
    head.innerHTML = '';
    const today = todayDow();
    const monday = Term.dateOfTermWeek(state.term.startDate, state.week, 1);
    for (let d = 1; d <= 7; d++) {
      const date = Term.addDays(monday, d - 1);
      const md = `${date.getMonth() + 1}.${date.getDate()}`;
      const el = document.createElement('div');
      el.className = 'day-head' + (d === today ? ' today' : '');
      el.innerHTML = `${WEEK_LABELS[d - 1]}<span class="dnum">${md}</span>`;
      head.appendChild(el);
    }
  }

  function lighten(hex, amt) {
    const n = parseInt(String(hex || '#6366F1').replace('#', ''), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + amt);
    const g = Math.min(255, ((n >> 8) & 0xff) + amt);
    const b = Math.min(255, (n & 0xff) + amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  function todayDow() {
    return ((new Date().getDay() + 6) % 7) + 1; // 1=周一 ... 7=周日
  }

  // 让课程块竖排名字完整显示：按节数和名字长度动态压字号
  function fitCourseName(el, name, span) {
    const rowH = 58;
    const gap = 3;
    const padV = 12; // padding 6+6
    const avail = span * rowH + (span - 1) * gap - padV;
    const spacing = 1;
    let fs = 12;
    while (fs > 8) {
      const h = name.length * fs + Math.max(0, name.length - 1) * spacing;
      if (h <= avail) break;
      fs -= 1;
    }
    el.style.fontSize = fs + 'px';
    el.style.letterSpacing = spacing + 'px';
  }

  /* ---------- 时间工具 ---------- */

  function toMin(hhmm) {
    const m = String(hhmm || '').match(/(\d{1,2}):(\d{2})/);
    return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : -1;
  }

  function nowMin() {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function fmtLeft(mins) {
    if (mins <= 0) return '马上';
    if (mins < 60) return `${mins} 分钟`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
  }

  function renderGrid() {
    renderGridHead();
    const sections = state.settings.sectionTimes;
    const body = $('gridBody');
    const today = todayDow();
    const adj = adjSets();
    body.innerHTML = '';

    sections.forEach((s, i) => {
      const t = document.createElement('div');
      t.className = 'cell-time';
      t.style.gridColumn = '1';
      t.style.gridRow = String(i + 1);
      t.innerHTML = `<b>${s.index}</b><span>${s.start}</span>`;
      body.appendChild(t);

      for (let d = 1; d <= 7; d++) {
        const date = Term.dateOfTermWeek(state.term.startDate, state.week, d);
        const dateStr = Term.toISODate(date);
        if (adj.holidaySet.has(dateStr)) {
          const ph = document.createElement('div');
          ph.className = 'cell-holiday' + (d === today ? ' cell-col-today' : '');
          ph.style.gridColumn = String(d + 1);
          ph.style.gridRow = String(i + 1);
          ph.textContent = '放假';
          body.appendChild(ph);
          continue;
        }
        let targetWeek = state.week, targetDow = d, isMakeup = false;
        if (adj.makeupMap[dateStr]) {
          const m = adj.makeupMap[dateStr];
          targetWeek = m.week;
          targetDow = m.dayOfWeek;
          isMakeup = true;
        }
        const c = state.courses.find(
          (x) => x.dayOfWeek === targetDow && x.startSection === s.index && (x.weeks || []).indexOf(targetWeek) >= 0
        );
        if (c) {
          const span = Math.max(1, (c.endSection || c.startSection) - c.startSection + 1);
          const b = document.createElement('div');
          b.className = 'course-block' + (span === 1 ? ' short' : '') + (isMakeup ? ' makeup' : '');
          b.style.gridColumn = String(d + 1);
          b.style.gridRow = `${i + 1} / span ${span}`;
          b.style.setProperty('--cbg', c.color);
          b.style.setProperty('--cbg2', lighten(c.color, 26));
          b.innerHTML = `<div class="n"></div><div class="p"></div>`;
          b.querySelector('.n').textContent = c.name;
          b.querySelector('.p').textContent = c.location || '';
          fitCourseName(b.querySelector('.n'), c.name, span);
          b.onclick = () => openCourse(c.id);
          body.appendChild(b);
        } else {
          const e = document.createElement('div');
          e.className = 'cell-empty' + (d === today ? ' cell-col-today' : '');
          e.style.gridColumn = String(d + 1);
          e.style.gridRow = String(i + 1);
          body.appendChild(e);
        }
      }
    });

    renderNowLine();
  }

  function renderDay() {
    const tabs = $('dayTabs');
    const today = todayDow();
    tabs.innerHTML = '';
    WEEK_LABELS.forEach((l, i) => {
      const b = document.createElement('button');
      b.textContent = l;
      b.className = (state.day === i + 1 ? 'active' : '') + (i + 1 === today ? ' is-today' : '');
      b.onclick = () => { state.day = i + 1; renderDay(); };
      tabs.appendChild(b);
    });

    const monday = Term.dateOfTermWeek(state.term.startDate, state.week, 1);
    const date = Term.addDays(monday, state.day - 1);
    const dateStr = Term.toISODate(date);
    const adj = adjSets();
    let targetWeek = state.week, targetDow = state.day, isMakeup = false, isHoliday = false;
    if (adj.holidaySet.has(dateStr)) isHoliday = true;
    else if (adj.makeupMap[dateStr]) {
      const m = adj.makeupMap[dateStr];
      targetWeek = m.week;
      targetDow = m.dayOfWeek;
      isMakeup = true;
    }

    const wrap = $('dayList');
    if (isHoliday) {
      renderTodayCard([], false, false, true);
      wrap.innerHTML = '<p style="text-align:center;color:var(--text-3);padding:40px 0">这天放假，没有课</p>';
      return;
    }

    const list = state.courses
      .filter((c) => c.dayOfWeek === targetDow && (c.weeks || []).indexOf(targetWeek) >= 0)
      .sort((a, b) => a.startSection - b.startSection);

    renderTodayCard(list, isMakeup);

    const isToday = state.day === today && state.week === Term.currentWeekOf(state.term.startDate, state.term.totalWeeks);
    const now = nowMin();

    wrap.innerHTML = '';
    if (!list.length) {
      wrap.innerHTML = '<p style="text-align:center;color:var(--text-3);padding:40px 0">' + (isMakeup ? '补课日暂无对应课程' : '这天没有课') + '</p>';
      return;
    }
    list.forEach((c) => {
      const s = toMin(c.startTime);
      const e = toMin(c.endTime);
      let phase = '';
      if (isToday && s >= 0 && e > s) {
        if (now >= e) phase = 'done';
        else if (now >= s) phase = 'now';
      }

      const item = document.createElement('div');
      item.className = 'day-item' + (phase ? ' ' + phase : '') + (isMakeup ? ' makeup' : '');
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.background = c.color;
      const info = document.createElement('div');
      info.className = 'info';
      const t = document.createElement('div');
      t.className = 't';
      t.textContent = c.name;
      if (phase === 'now') {
        const b = document.createElement('span');
        b.className = 'badge now';
        b.textContent = `正在上 · 还剩 ${fmtLeft(e - now)}`;
        t.appendChild(b);
      } else if (phase === 'done') {
        const b = document.createElement('span');
        b.className = 'badge done';
        b.textContent = '已结束';
        t.appendChild(b);
      }
      const m = document.createElement('div');
      m.className = 'm';
      m.textContent = `${c.startTime}-${c.endTime} · 第${c.startSection}${c.endSection && c.endSection !== c.startSection ? '-' + c.endSection : ''}节 · ${[c.location, c.teacher].filter(Boolean).join(' · ') || '未填地点'}`;
      info.appendChild(t);
      info.appendChild(m);
      item.appendChild(bar);
      item.appendChild(info);
      item.onclick = () => openCourse(c.id);
      wrap.appendChild(item);
    });
  }

  /* 今日概览卡片 */

  function renderTodayCard(list, isMakeup, _unused, isHoliday) {
    const card = $('todayCard');
    const today = todayDow();
    const curWeek = Term.currentWeekOf(state.term.startDate, state.term.totalWeeks);
    const isToday = state.day === today && state.week === curWeek;

    card.innerHTML = '';
    card.hidden = false;
    card.className = 'today-card' + (isToday ? '' : ' plain');

    if (isHoliday && isToday) {
      const top = document.createElement('div');
      top.className = 'tc-top';
      const main = document.createElement('div');
      main.className = 'tc-main';
      main.textContent = '今天放假 🎉';
      const date = document.createElement('div');
      date.className = 'tc-date';
      const d = new Date();
      date.textContent = `${d.getMonth() + 1}月${d.getDate()}日 · 第${state.week}周`;
      top.appendChild(main);
      top.appendChild(date);
      card.appendChild(top);
      addSub(card, '好好休息');
      return;
    }

    const top = document.createElement('div');
    top.className = 'tc-top';
    const main = document.createElement('div');
    main.className = 'tc-main';
    const date = document.createElement('div');
    date.className = 'tc-date';

    if (isToday) {
      const d = new Date();
      date.textContent = `${d.getMonth() + 1}月${d.getDate()}日 · 第${state.week}周${isMakeup ? ' · 补课日' : ''}`;

      const now = nowMin();
      const cur = list.find((c) => {
        const s = toMin(c.startTime), e = toMin(c.endTime);
        return s >= 0 && e > s && now >= s && now < e;
      });
      const next = list.find((c) => toMin(c.startTime) > now);
      const remain = list.filter((c) => toMin(c.endTime) > now).length;

      if (cur) {
        main.textContent = `正在上：${cur.name}`;
        addSub(card, `还剩 ${fmtLeft(toMin(cur.endTime) - now)}下课 · ${[cur.location, cur.teacher].filter(Boolean).join(' · ') || '未填地点'}`);
        addNext(card, '下课之后', next ? `${next.startTime} ${next.name}` : '今天没有后续课程了');
      } else if (next) {
        main.textContent = `还剩 ${remain} 节课`;
        addSub(card, `下课时间约 ${lastEnd(list)}`);
        addNext(card, '下一节', `${next.startTime} ${next.name}${next.location ? ' · ' + next.location : ''}`, `还有 ${fmtLeft(toMin(next.startTime) - now)}`);
      } else if (list.length) {
        main.textContent = '今天的课上完啦';
        addSub(card, `共 ${list.length} 节 · 结束于 ${lastEnd(list)}`);
      } else {
        main.textContent = '今天没课';
        addSub(card, '好好休息 🎉');
      }
    } else {
      const monday = Term.dateOfTermWeek(state.term.startDate, state.week, 1);
      const d = Term.addDays(monday, state.day - 1);
      date.textContent = `${d.getMonth() + 1}月${d.getDate()}日 · 第${state.week}周${isMakeup ? ' · 补课日' : ''}`;
      main.textContent = list.length ? `周${WEEK_LABELS[state.day - 1]} · ${list.length} 节课` : `周${WEEK_LABELS[state.day - 1]} · 没课`;
      if (list.length) {
        const first = list[0];
        addSub(card, `${first.startTime} - ${lastEnd(list)}`);
      }
      const back = document.createElement('div');
      back.className = 'tc-back';
      back.textContent = '回到今天';
      back.onclick = () => {
        state.week = curWeek > 0 ? curWeek : state.week;
        state.day = today;
        renderHome();
      };
      card.appendChild(back);
    }

    top.appendChild(main);
    top.appendChild(date);
    card.insertBefore(top, card.firstChild);
  }

  function addSub(card, text) {
    const el = document.createElement('div');
    el.className = 'tc-sub';
    el.textContent = text;
    card.appendChild(el);
  }

  function addNext(card, pill, text, tail) {
    const el = document.createElement('div');
    el.className = 'tc-next';
    const p = document.createElement('span');
    p.className = 'pill';
    p.textContent = pill;
    el.appendChild(p);
    const s = document.createElement('span');
    s.textContent = tail ? `${text} · ${tail}` : text;
    el.appendChild(s);
    card.appendChild(el);
  }

  function lastEnd(list) {
    let max = -1;
    list.forEach((c) => { const m = toMin(c.endTime); if (m > max) max = m; });
    if (max < 0) return '--:--';
    return `${String(Math.floor(max / 60)).padStart(2, '0')}:${String(max % 60).padStart(2, '0')}`;
  }

  function nowSectionPos(sections) {
    const now = nowMin();
    for (let i = 0; i < sections.length; i++) {
      const s = toMin(sections[i].start);
      const e = toMin(sections[i].end);
      if (now < s) {
        if (i === 0) return { row: 0, ratio: 0, offset: -3 };
        const pe = toMin(sections[i - 1].end);
        if (now >= pe) return { row: i, ratio: 0, offset: -3 };
        return { row: i, ratio: 0, offset: -3 };
      }
      if (now < e) return { row: i, ratio: (now - s) / Math.max(1, e - s), offset: 0 };
    }
    return null;
  }

  function nowLineTop(sections) {
    const p = nowSectionPos(sections);
    if (!p) return null;
    return p.row * 61 + p.ratio * 58 + p.offset;
  }

  function renderNowLine() {
    const body = $('gridBody');
    let line = $('nowLine');
    const sections = state.settings.sectionTimes;
    const today = todayDow();
    if (state.week !== Term.currentWeekOf(state.term.startDate, state.term.totalWeeks)) {
      if (line) line.hidden = true;
      return;
    }
    const top = nowLineTop(sections);
    if (top == null) {
      if (line) line.hidden = true;
      return;
    }
    if (!line) {
      line = document.createElement('div');
      line.id = 'nowLine';
      line.className = 'now-line';
      body.appendChild(line);
    }
    line.hidden = false;
    line.style.top = top + 'px';
    line.style.gridColumn = String(today + 1); // 时间列占 1，今天列右移
    line.style.gridRow = `1 / span ${sections.length}`;
    const d = new Date();
    line.dataset.time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  let _todayTimer = null;
  function startTodayTimer() {
    stopTodayTimer();
    _todayTimer = setInterval(() => {
      if (state.tab !== 'schedule' || state.page !== 'home') return;
      if (state.viewMode === 'day' && !$('dayWrap').hidden) renderDay();
      else if (state.viewMode === 'week' && !$('gridWrap').hidden) renderNowLine();
    }, 30000);
  }
  function stopTodayTimer() {
    if (_todayTimer) { clearInterval(_todayTimer); _todayTimer = null; }
  }

  /* ---------- 导入 ---------- */

  function renderImport() {
    const s = state.settings;
    $('engineName').textContent = s.visionProvider === 'off' || !s.apiKey
      ? '未配置（识别不可用，可手动添加）'
      : (Vision.PROVIDERS[s.visionProvider] || {}).name || '云端视觉大模型';
  }

  async function runRecognize(source) {
    const status = $('recognizeStatus');
    const resultBox = $('resultBox');
    resultBox.hidden = true;
    status.hidden = false;
    status.textContent = '正在读取图片…';

    try {
      const dataUrl = await Vision.pickImage(source);
      status.textContent = '正在识别课表…';
      const base64 = await Vision.compress(dataUrl, 1280);

      const settings = Store.getSettings();
      if (settings.visionProvider === 'off' || !settings.apiKey) {
        status.innerHTML = '<span style="color:#C0392B">未配置识别 API Key</span><br><span style="font-size:13px;color:#888">可在设置页配置，或用「手动添加」录入课程</span>';
        return;
      }

      const res = await Vision.recognize(base64, settings);
      if (!res.ok) {
        status.innerHTML = `<span style="color:#C0392B">识别失败：${res.error}</span>`;
        return;
      }

      state.results = res.items;
      state.selected = new Set(res.items.map((_, i) => i));
      state.expanded = -1;
      status.hidden = true;
      resultBox.hidden = false;
      $('resultHint').textContent = `识别到 ${res.items.length} 条，取消勾选不需要的：`;
      renderResults();
    } catch (e) {
      status.innerHTML = `<span style="color:#C0392B">出错了：${e && e.message ? e.message : e}</span>`;
    }
  }

  /* ---------- 导入：模式切换 ---------- */

  function switchImportMode(m) {
    state.importMode = m;
    renderChips(
      $('impMode'),
      [
        { label: '表格文件（推荐）', value: 'sheet' },
        { label: '图片识别', value: 'image' },
      ],
      m,
      (v) => switchImportMode(v)
    );
    $('impSheetBox').hidden = m !== 'sheet';
    $('impImageBox').hidden = m !== 'image';
  }

  /* ---------- 导入：表格文件（xls/xlsx/csv/粘贴） ---------- */

  function splitDelimited(text) {
    const sep = text.indexOf('\t') >= 0 ? '\t' : ',';
    return text
      .split(/\r?\n/)
      .map((line) => line.split(sep).map((v) => String(v).replace(/^"|"$/g, '').trim()));
  }

  function pickSheetFile() {
    const status = $('recognizeStatus');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xls,.xlsx,.csv,.txt';
    input.onchange = function () {
      const file = input.files && input.files[0];
      if (!file) return;
      status.hidden = false;
      status.textContent = '正在读取文件…';
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const name = String(file.name || '').toLowerCase();
          let cells;
          if (/\.(csv|txt)$/.test(name)) {
            cells = splitDelimited(new TextDecoder('utf-8').decode(reader.result));
          } else {
            if (!window.XLSX) throw new Error('表格解析库未加载，请改粘贴方式或另存为 CSV');
            const wb = window.XLSX.read(new Uint8Array(reader.result), { type: 'array' });
            cells = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
              header: 1,
              defval: '',
              blankrows: false,
            });
          }
          applyParsed(cells);
        } catch (e) {
          status.innerHTML = `<span style="color:#C0392B">读取失败：${(e && e.message) || e}</span>`;
        }
      };
      reader.onerror = () => {
        status.textContent = '文件读取失败';
      };
      reader.readAsArrayBuffer(file);
    };
    input.click();
  }

  function parsePasted() {
    const text = String($('pasteArea').value || '').trim();
    if (!text) return toast('先把课表内容粘贴进去');
    applyParsed(splitDelimited(text));
  }

  function applyParsed(cells) {
    const status = $('recognizeStatus');
    const r = App.XlsParse.parseCells(cells);
    if (!r.ok) {
      status.hidden = false;
      status.innerHTML = `<span style="color:#C0392B">${r.error}</span>`;
      $('resultBox').hidden = true;
      return;
    }

    let termMsg = '';
    if (r.term && r.term.startDate) {
      const t = Store.getTerm();
      if (t.startDate !== r.term.startDate || t.totalWeeks !== r.term.totalWeeks) {
        t.startDate = r.term.startDate;
        t.totalWeeks = r.term.totalWeeks;
        Store.setTerm(t);
        state.term = Store.getTerm();
        termMsg = `，学期已自动设为 ${r.term.startDate} 起、共 ${r.term.totalWeeks} 周`;
      }
    }

    state.results = r.items;
    state.selected = new Set(r.items.map((_, i) => i));
    state.expanded = -1;
    status.hidden = true;
    $('resultBox').hidden = false;
    $('resultHint').textContent = `解析到 ${r.items.length} 门课${termMsg}。点条目可修改，点左侧方框取消导入：`;
    renderResults();
    if (r.warnings && r.warnings.length) toast(r.warnings[0]);
  }

  function renderResults() {
    const box = $('resultList');
    box.innerHTML = '';
    const term = Store.getTerm();

    const asCourses = state.results.map((it) => ({
      dayOfWeek: it.dayOfWeek,
      startTime: it.startTime,
      endTime: it.endTime,
      weeks: Weeks.parseWeeksExpr(it.weeksExpr || '', term.totalWeeks).weeks,
    }));
    const cfMap = {};
    Conflicts.find(asCourses).forEach((cf) => {
      cfMap[cf.i] = state.results[cf.j].name;
      cfMap[cf.j] = state.results[cf.i].name;
    });

    state.results.forEach((it, i) => {
      const on = state.selected.has(i);
      const div = document.createElement('div');
      div.className = 'result-item' + (on ? '' : ' off') + (cfMap[i] ? ' conflict' : '');

      const mark = document.createElement('div');
      mark.className = 'mark';
      mark.textContent = on ? '[x]' : '[ ]';
      mark.onclick = (e) => {
        e.stopPropagation();
        if (on) state.selected.delete(i);
        else state.selected.add(i);
        renderResults();
      };

      const body = document.createElement('div');
      body.className = 'ri-body';
      const n = document.createElement('div');
      n.className = 'n';
      n.textContent = it.name;

      const m1 = document.createElement('div');
      m1.className = 'm';
      const secTxt = it.startSection
        ? ` 第${it.startSection}${it.endSection && it.endSection !== it.startSection ? '-' + it.endSection : ''}节`
        : '';
      const timeTxt = it.startTime ? ` ${it.startTime}-${it.endTime}` : '';
      m1.textContent = `周${WEEK_LABELS[(it.dayOfWeek || 1) - 1]}${secTxt}${timeTxt}`;

      const m2 = document.createElement('div');
      m2.className = 'm sub';
      const parsed = Weeks.parseWeeksExpr(it.weeksExpr || '', term.totalWeeks);
      m2.textContent = [it.location, it.teacher, Weeks.describeWeeks(parsed.weeks, term.totalWeeks)]
        .filter(Boolean)
        .join(' · ');

      body.appendChild(n);
      body.appendChild(m1);
      body.appendChild(m2);

      if (cfMap[i]) {
        const tag = document.createElement('div');
        tag.className = 'conflict-tag';
        tag.textContent = `时间冲突：与「${cfMap[i]}」重叠`;
        body.appendChild(tag);
      }

      body.onclick = () => {
        state.expanded = state.expanded === i ? -1 : i;
        renderResults();
      };

      div.appendChild(mark);
      div.appendChild(body);
      if (state.expanded === i) div.appendChild(buildResultEditor(i));
      box.appendChild(div);
    });
  }

  function riLabel(t) {
    const el = document.createElement('span');
    el.className = 'ri-label';
    el.textContent = t;
    return el;
  }

  function riTextRow(title, value, onChange) {
    const row = document.createElement('div');
    row.className = 'ri-row';
    row.appendChild(riLabel(title));
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = value || '';
    inp.oninput = () => onChange(inp.value);
    row.appendChild(inp);
    return row;
  }

  function buildResultEditor(i) {
    const it = state.results[i];
    const wrap = document.createElement('div');
    wrap.className = 'ri-edit';
    wrap.onclick = (e) => e.stopPropagation();

    const dayRow = document.createElement('div');
    dayRow.className = 'ri-row';
    dayRow.appendChild(riLabel('星期'));
    const dayChips = document.createElement('div');
    dayChips.className = 'chips';
    renderChips(
      dayChips,
      WEEK_LABELS.map((d, k) => ({ label: d, value: k + 1 })),
      it.dayOfWeek,
      (v) => {
        it.dayOfWeek = v;
        renderResults();
      }
    );
    dayRow.appendChild(dayChips);

    const wkRow = document.createElement('div');
    wkRow.className = 'ri-row';
    wkRow.appendChild(riLabel('周次'));
    const wkBox = document.createElement('div');
    wkBox.className = 'ri-field';
    const wkInp = document.createElement('input');
    wkInp.type = 'text';
    wkInp.value = it.weeksExpr || '';
    wkInp.placeholder = '留空＝全学期，如 1-16周(双)';
    const wkHint = document.createElement('div');
    wkHint.className = 'ri-hint';
    const refresh = () => {
      const p = Weeks.parseWeeksExpr(wkInp.value, Store.getTerm().totalWeeks);
      wkHint.textContent = '→ ' + Weeks.describeWeeks(p.weeks, Store.getTerm().totalWeeks);
    };
    wkInp.oninput = () => {
      it.weeksExpr = wkInp.value;
      refresh();
    };
    refresh();
    wkBox.appendChild(wkInp);
    wkBox.appendChild(wkHint);
    wkRow.appendChild(wkBox);

    const del = document.createElement('button');
    del.className = 'ghost sm';
    del.textContent = '删除这条';
    del.onclick = () => {
      state.results.splice(i, 1);
      state.selected = new Set(state.results.map((_, k) => k));
      state.expanded = -1;
      renderResults();
    };

    wrap.appendChild(dayRow);
    wrap.appendChild(riTextRow('课程名', it.name, (v) => { it.name = v; }));
    wrap.appendChild(riTextRow('地点', it.location, (v) => { it.location = v; }));
    wrap.appendChild(riTextRow('教师', it.teacher, (v) => { it.teacher = v; }));
    wrap.appendChild(wkRow);
    wrap.appendChild(del);
    return wrap;
  }

  function guessSection(hhmm, sections, useEnd) {
    if (!hhmm) return 1;
    const m = String(hhmm).match(/(\d{1,2}):(\d{2})/);
    if (!m) return 1;
    const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    let best = sections[0];
    let bestDiff = Infinity;
    sections.forEach((s) => {
      const sm = String(useEnd ? s.end || s.start : s.start).match(/(\d{1,2}):(\d{2})/);
      if (!sm) return;
      const d = Math.abs(parseInt(sm[1], 10) * 60 + parseInt(sm[2], 10) - t);
      if (d < bestDiff) {
        bestDiff = d;
        best = s;
      }
    });
    return best.index;
  }

  function shiftResults(delta) {
    if (!state.results || !state.results.length) return;
    state.results.forEach((it) => {
      const d = (it.dayOfWeek || 1) - 1;
      it.dayOfWeek = ((d + delta) % 7 + 7) % 7 + 1;
    });
    renderResults();
  }

  // 自动对齐：让最早有课的那天变为周一（仅作用于预览）
  function autoAlignResults() {
    if (!state.results || !state.results.length) return;
    const dows = state.results.map((it) => it.dayOfWeek || 1);
    const minDow = Math.min.apply(null, dows);
    if (minDow === 1) { toast('预览已对齐到周一到周五'); return; }
    const shift = minDow - 1;
    state.results.forEach((it) => {
      const d = (it.dayOfWeek || 1) - 1;
      it.dayOfWeek = ((d - shift) % 7 + 7) % 7 + 1;
    });
    renderResults();
    toast('预览已对齐到周一到周五');
  }

  // 已导入课程的自动对齐：最早上课日设为周一（写库）
  function autoAlignToMonFri() {
    const courses = Store.getCourses();
    if (!courses.length) { toast('还没有课程'); return; }
    const dows = courses.map((c) => c.dayOfWeek || 1);
    const minDow = Math.min.apply(null, dows);
    if (minDow === 1) { toast('已经对齐到周一到周五'); return; }
    const shift = minDow - 1;
    courses.forEach((c) => {
      const d = (c.dayOfWeek || 1) - 1;
      c.dayOfWeek = ((d - shift) % 7 + 7) % 7 + 1;
    });
    Store.setCourses(courses);
    reload();
    renderAll();
    toast('已整体对齐：最早上课日设为周一');
  }

  function importSelected() {
    const term = Store.getTerm();
    const settings = Store.getSettings();
    const chosen = state.results.filter((_, i) => state.selected.has(i));
    if (!chosen.length) return toast('请至少选择一门课');

    // 导入前清空旧课，避免脏数据叠加/错位（默认勾选，导入结果页可取消）
    const clearChk = $('chkClearBefore');
    if (clearChk && clearChk.checked) {
      Store.clearCourses();
    }

    chosen.forEach((it) => {
      const p = Weeks.parseWeeksExpr(it.weeksExpr || '', term.totalWeeks);
      const startSection = it.startSection || guessSection(it.startTime, settings.sectionTimes);
      const endSection = Math.max(
        startSection,
        it.endSection || guessSection(it.endTime || it.startTime, settings.sectionTimes, true)
      );
      const s0 = settings.sectionTimes.find((x) => x.index === startSection);
      const s1 = settings.sectionTimes.find((x) => x.index === endSection);
      const course = {
        name: it.name,
        teacher: it.teacher,
        book: it.book || '',
        location: it.location,
        dayOfWeek: Weeks.parseDayOfWeek(it.dayOfWeek),
        startTime: it.startTime || (s0 && s0.start) || '08:00',
        endTime: it.endTime || (s1 && s1.end) || '08:45',
        startSection,
        endSection,
        weeks: p.weeks,
        weekPattern: p.pattern,
        weeksExpr: it.weeksExpr,
        color: Store.colorFor(it.name),
        remindBeforeMin: -1,
      };
      // 去重：若已存在同签名课程（同课名+星期+节次+周次），复用其 id 原地更新，避免重复导入产生副本
      const sig = Store.courseSig(course);
      const existing = Store.getCourses().find((c) => Store.courseSig(c) === sig);
      course.id = existing ? existing.id : Store.newId();
      Store.upsertCourse(course);
    });

    markSchemaCurrent();
    afterDataChange(`已导入 ${chosen.length} 门课`, true);
  }

  /* ---------- 课程编辑 ---------- */

  function openCourse(id) {
    state.editingId = id;
    if (id === 'new') {
      state.editing = {
        id: Store.newId(),
        name: '',
        dayOfWeek: 1,
        startTime: '08:00',
        endTime: '08:45',
        startSection: 1,
        endSection: 1,
        weeks: [],
        weekPattern: 'all',
        weeksExpr: '',
        book: '',
        color: Store.COLORS[0],
        remindBeforeMin: -1,
      };
    } else {
      const found = Store.getCourses().find((c) => c.id === id);
      if (!found) return;
      state.editing = JSON.parse(JSON.stringify(found));
    }
    showPage('course');
  }

  function renderChips(container, options, value, onSelect) {
    container.innerHTML = '';
    options.forEach((o) => {
      const b = document.createElement('button');
      b.className = 'chip' + (value === o.value ? ' active' : '');
      b.textContent = o.label;
      b.onclick = () => {
        onSelect(o.value);
        renderChips(container, options, o.value, onSelect);
      };
      container.appendChild(b);
    });
  }

  function applySection(start, end) {
    const e = state.editing;
    const s0 = state.settings.sectionTimes.find((x) => x.index === start);
    const s1 = state.settings.sectionTimes.find((x) => x.index === end);
    e.startSection = start;
    e.endSection = end;
    e.startTime = s0 ? s0.start : e.startTime;
    e.endTime = s1 ? s1.end : e.endTime;
    $('fStart').value = e.startTime;
    $('fEnd').value = e.endTime;
  }

  function renderSectionChips() {
    const e = state.editing;
    const opts = state.settings.sectionTimes.map((s) => ({ label: String(s.index), value: s.index }));
    renderChips($('fSectionStart'), opts, e.startSection, (v) => applySection(v, Math.max(v, e.endSection)));
    renderChips($('fSectionEnd'), opts, e.endSection, (v) => applySection(Math.min(v, e.startSection), v));
  }

  function renderCourse() {
    const e = state.editing;
    $('fName').value = e.name || '';
    $('fTeacher').value = e.teacher || '';
    $('fBook').value = e.book || '';
    $('fLocation').value = e.location || '';
    $('fStart').value = e.startTime;
    $('fEnd').value = e.endTime;
    $('fWeeks').value = e.weeksExpr || '';
    $('btnDelete').hidden = state.editingId === 'new';

    renderChips($('fDay'), WEEK_LABELS.map((l, i) => ({ label: l, value: i + 1 })), e.dayOfWeek, (v) => { e.dayOfWeek = v; });
    renderSectionChips();

    const remindOpts = [{ label: '跟随全局', value: -1 }].concat(
      Store.REMIND_OPTIONS.filter((v) => v > 0).map((v) => ({ label: `${v}分钟`, value: v }))
    );
    renderChips($('fRemind'), remindOpts, e.remindBeforeMin, (v) => { e.remindBeforeMin = v; });

    const colorBox = $('fColor');
    colorBox.innerHTML = '';
    Store.COLORS.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'swatch' + (e.color === c ? ' active' : '');
      b.style.background = c;
      b.onclick = () => { e.color = c; renderCourse(); };
      colorBox.appendChild(b);
    });

    updateWeeksPreview();
  }

  function updateWeeksPreview() {
    const expr = $('fWeeks').value;
    const p = Weeks.parseWeeksExpr(expr, state.term.totalWeeks);
    $('weeksPreview').textContent = '解析结果：' + Weeks.describeWeeks(p.weeks, state.term.totalWeeks);
    state.editing.weeksExpr = expr;
    state.editing.weeks = p.weeks;
    state.editing.weekPattern = p.pattern;
  }

  function saveCourse() {
    const e = state.editing;
    e.name = $('fName').value.trim();
    if (!e.name) return toast('请填写课程名称');
    e.teacher = $('fTeacher').value.trim();
    e.book = $('fBook').value.trim();
    e.location = $('fLocation').value.trim();
    e.startTime = $('fStart').value;
    e.endTime = $('fEnd').value;
    Store.upsertCourse(e);
    afterDataChange('已保存', false);
  }

  /* ---------- 考试 ---------- */

  function renderExam() {
    const list = $('examList');
    const exams = Store.getExams().slice().sort(
      (a, b) => new Date(a.examDate + 'T' + (a.examTime || '00:00')) - new Date(b.examDate + 'T' + (b.examTime || '00:00'))
    );
    list.innerHTML = '';
    $('examEmpty').hidden = exams.length > 0;
    const now = Date.now();
    exams.forEach((e) => {
      const passed = new Date(e.examDate + 'T' + (e.examTime || '23:59')).getTime() < now;
      const item = document.createElement('div');
      item.className = 'exam-card' + (passed ? ' passed' : '');
      item.innerHTML = `
        <div class="ec-top">
          <div class="ec-name"></div>
          <div class="ec-count">${passed ? '已结束' : examCountdown(e)}</div>
        </div>
        <div class="ec-meta">${e.examDate}${e.examTime ? ' ' + e.examTime : ''} · ${e.location || '地点未填'}</div>
        ${e.note ? `<div class="ec-note"></div>` : ''}`;
      item.querySelector('.ec-name').textContent = e.subject;
      if (e.note) item.querySelector('.ec-note').textContent = e.note;
      item.onclick = () => openExam(e.id);
      list.appendChild(item);
    });
  }

  function openExam(id) {
    state.examEditingId = id;
    const e = id && id !== 'new' ? Store.getExams().find((x) => x.id === id) : null;
    $('eSubject').value = e ? e.subject : '';
    $('eDate').value = e ? e.examDate : '';
    $('eTime').value = e && e.examTime ? e.examTime : '';
    $('eLocation').value = e ? (e.location || '') : '';
    $('eNote').value = e ? (e.note || '') : '';
    $('eDelete').hidden = !e;
    $('pageTitle').textContent = e ? '编辑考试' : '添加考试';
    $('viewExam').hidden = true;
    $('viewExamEdit').hidden = false;
    $('btnBack').hidden = false;
    $('btnSave').hidden = false;
    $('btnSave').textContent = '保存';
  }

  function saveExam() {
    const subject = $('eSubject').value.trim();
    if (!subject) return toast('请填写考试科目');
    const examDate = $('eDate').value;
    if (!examDate) return toast('请选择考试日期');
    const e = {
      id: state.examEditingId && state.examEditingId !== 'new' ? state.examEditingId : Store.newId(),
      subject,
      examDate,
      examTime: $('eTime').value || null,
      location: $('eLocation').value.trim(),
      note: $('eNote').value.trim(),
    };
    Store.upsertExam(e);
    state.examEditingId = null;
    $('viewExamEdit').hidden = true;
    $('viewExam').hidden = false;
    $('btnSave').hidden = true;
    renderExam();
    toast('已保存');
  }

  async function recognizeExams() {
    const status = $('examStatus');
    status.hidden = false;
    status.textContent = '正在读取图片…';
    try {
      const dataUrl = await Vision.pickImage('album');
      status.textContent = '正在识别考试安排…';
      const base64 = await Vision.compress(dataUrl, 1280);
      const settings = Store.getSettings();
      if (settings.visionProvider === 'off' || !settings.apiKey) {
        status.innerHTML = '<span style="color:#C0392B">未配置识别 API Key</span><br><span style="font-size:13px;color:#888">在「课程表 → 设置 → 课表识别」里填 Key 后可用</span>';
        return;
      }
      const res = await Vision.recognizeExams(base64, settings);
      if (!res.ok) {
        status.innerHTML = `<span style="color:#C0392B">识别失败：${res.error}</span>`;
        return;
      }
      res.items.forEach((it) => Store.upsertExam(Object.assign({ id: Store.newId() }, it)));
      status.hidden = true;
      renderExam();
      toast(`已添加 ${res.items.length} 场考试`);
    } catch (e) {
      status.innerHTML = `<span style="color:#C0392B">出错了：${e && e.message ? e.message : e}</span>`;
    }
  }

  /* ---------- 课表导出图片 ---------- */

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function exportWeekImage() {
    if (!state.term) return toast('请先在设置里填写学期开始日期');
    const sections = state.settings.sectionTimes;
    const adj = adjSets();
    const timeW = 42, colW = 58, rowH = 56, pad = 16, headH = 44;
    const W = pad * 2 + timeW + 7 * colW;
    const H = pad * 2 + headH + sections.length * rowH;
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = W * scale;
    c.height = H * scale;
    const ctx = c.getContext('2d');
    ctx.scale(scale, scale);
    ctx.textBaseline = 'middle';

    // 背景（画布风浅灰）
    ctx.fillStyle = '#EEF1F6';
    ctx.fillRect(0, 0, W, H);

    // 标题
    ctx.fillStyle = '#0F172A';
    ctx.font = '600 16px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`课程表 · 第 ${state.week} 周`, pad, pad + 12);

    // 列头
    const monday = Term.dateOfTermWeek(state.term.startDate, state.week, 1);
    const labels = ['一', '二', '三', '四', '五', '六', '日'];
    ctx.textAlign = 'center';
    labels.forEach((l, d) => {
      const x = pad + timeW + d * colW + colW / 2;
      const date = Term.addDays(monday, d);
      ctx.fillStyle = '#64748B';
      ctx.font = '600 13px sans-serif';
      ctx.fillText(l, x, pad + 30);
      ctx.fillStyle = '#0F172A';
      ctx.font = '11px sans-serif';
      ctx.fillText(`${date.getMonth() + 1}.${date.getDate()}`, x, pad + 44);
    });

    // 时间列 + 单元格
    sections.forEach((s, i) => {
      const y = pad + headH + i * rowH;
      ctx.fillStyle = '#94A3B8';
      ctx.font = '10px sans-serif';
      ctx.fillText(String(s.index), pad + timeW / 2, y + rowH / 2 - 8);
      ctx.fillText(s.start, pad + timeW / 2, y + rowH / 2 + 6);
      for (let d = 0; d < 7; d++) {
        const x = pad + timeW + d * colW;
        ctx.fillStyle = '#F8FAFC';
        roundRect(ctx, x + 1.5, y + 1.5, colW - 3, rowH - 3, 8);
        ctx.fill();
      }
    });

    // 课程块
    sections.forEach((s, i) => {
      const y = pad + headH + i * rowH;
      for (let d = 1; d <= 7; d++) {
        const date = Term.dateOfTermWeek(state.term.startDate, state.week, d);
        const dateStr = Term.toISODate(date);
        if (adj.holidaySet.has(dateStr)) continue;
        let targetWeek = state.week, targetDow = d, isMakeup = false;
        if (adj.makeupMap[dateStr]) {
          const m = adj.makeupMap[dateStr];
          targetWeek = m.week;
          targetDow = m.dayOfWeek;
          isMakeup = true;
        }
        const course = state.courses.find(
          (x) => x.dayOfWeek === targetDow && x.startSection === s.index && (x.weeks || []).indexOf(targetWeek) >= 0
        );
        if (!course) continue;
        const span = Math.max(1, (course.endSection || course.startSection) - course.startSection + 1);
        const x = pad + timeW + (d - 1) * colW + 2;
        const yy = y + 2;
        const w = colW - 4;
        const h = span * rowH - 4;
        ctx.fillStyle = course.color || '#6366F1';
        roundRect(ctx, x, yy, w, h, 8);
        ctx.fill();
        ctx.fillStyle = '#fff';

        // 课程名竖排绘制，按块高动态压字号，保证完整显示在卡片内
        const availH = h - 12;
        const spacing = 1;
        let fs = 12;
        while (fs > 8) {
          const need = course.name.length * fs + Math.max(0, course.name.length - 1) * spacing;
          if (need <= availH) break;
          fs -= 1;
        }
        ctx.font = `600 ${fs}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cx = x + w / 2;
        let cy = yy + 8 + fs / 2;
        for (let k = 0; k < course.name.length; k++) {
          ctx.fillText(course.name[k], cx, cy);
          cy += fs + spacing;
        }

        // 地点也竖排，放在名字右侧（仅非短块且放得下）
        if (span > 1 && course.location) {
          const locFs = 9;
          const locH = course.location.length * locFs + Math.max(0, course.location.length - 1) * spacing;
          if (locH <= availH) {
            ctx.font = `${locFs}px sans-serif`;
            let ly = yy + 8 + locFs / 2;
            const lx = cx + fs / 2 + locFs + 2;
            for (let k = 0; k < course.location.length; k++) {
              ctx.fillText(course.location[k], lx, ly);
              ly += locFs + spacing;
            }
          }
        }
      }
    });

    c.toBlob(async (blob) => {
      if (!blob) return toast('生成图片失败');
      const fileName = `课程表-第${state.week}周.png`;
      try {
        const file = new File([blob], fileName, { type: 'image/png' });
        const url = URL.createObjectURL(blob);

        // Web 兜底：触发浏览器下载
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // 原生环境：保存到系统相册（DCIM/ScheduleApp）
        if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
          const Export = Capacitor.Plugins && Capacitor.Plugins.Export;
          if (Export && Export.saveImageToGallery) {
            const base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
            await Export.saveImageToGallery({ base64, filename: fileName });
            toast('已保存到相册（DCIM/ScheduleApp）');
          } else {
            toast('图片已生成，请从下载目录查看');
          }
        } else {
          toast('图片已生成，请从下载目录查看');
        }

        // 若系统支持分享，再弹分享面板
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: '课程表' }).catch(() => {});
        }
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      } catch (e) {
        toast('导出失败：' + (e && e.message ? e.message : e));
      }
    }, 'image/png');
  }

  /* ---------- 数据校准：整体移动一天 ---------- */

  function shiftDayOfWeek(delta) {
    const list = Store.getCourses();
    list.forEach((c) => {
      const d = (c.dayOfWeek || 1) - 1;
      c.dayOfWeek = ((d + delta) % 7 + 7) % 7 + 1;
    });
    Store.setCourses(list);
    afterDataChange('已移动课程', true);
  }

  /* ---------- 设置 ---------- */

  function renderAdjustments() {
    const s = Store.getSettings();
    const a = s.adjustments || { holidays: [], makeup: [] };

    const hl = $('holidayList');
    hl.innerHTML = '';
    if (!a.holidays.length) {
      hl.innerHTML = '<p class="sub">还没有设置放假日</p>';
    } else {
      a.holidays.forEach((dt) => {
        const row = document.createElement('div');
        row.className = 'adj-item';
        const txt = document.createElement('span');
        txt.className = 'adj-txt';
        txt.textContent = dt + ' 放假';
        const del = document.createElement('button');
        del.className = 'adj-del';
        del.textContent = '删除';
        del.onclick = () => {
          s.adjustments.holidays = (s.adjustments.holidays || []).filter((x) => x !== dt);
          Store.setSettings(s);
          renderAdjustments();
          afterAdjust();
        };
        row.appendChild(txt);
        row.appendChild(del);
        hl.appendChild(row);
      });
    }

    const ml = $('makeupList');
    ml.innerHTML = '';
    if (!a.makeup.length) {
      ml.innerHTML = '<p class="sub">还没有补课安排</p>';
    } else {
      a.makeup.forEach((m) => {
        const row = document.createElement('div');
        row.className = 'adj-item';
        const txt = document.createElement('span');
        txt.className = 'adj-txt';
        txt.textContent = `${m.date} 补 第${m.week}周周${WEEK_LABELS[m.dayOfWeek - 1]}的课`;
        const del = document.createElement('button');
        del.className = 'adj-del';
        del.textContent = '删除';
        del.onclick = () => {
          s.adjustments.makeup = (s.adjustments.makeup || []).filter(
            (x) => !(x.date === m.date && x.week === m.week && x.dayOfWeek === m.dayOfWeek)
          );
          Store.setSettings(s);
          renderAdjustments();
          afterAdjust();
        };
        row.appendChild(txt);
        row.appendChild(del);
        ml.appendChild(row);
      });
    }
  }

  function afterAdjust() {
    reload();
    if ($('viewHome').hidden === false) renderHome();
  }

  function renderSettings() {
    const s = Store.getSettings();
    const t = Store.getTerm();

    renderChips($('sTheme'), [
      { label: '跟随系统', value: 'auto' },
      { label: '浅色', value: 'light' },
      { label: '深色', value: 'dark' },
    ], s.theme, (v) => {
      s.theme = v;
      Store.setSettings(s);
      state.settings = s; // 保证 applyTheme 读到最新值
      applyTheme();
    });

    renderChips($('sRemind'), Store.REMIND_OPTIONS.map((v) => ({ label: v === 0 ? '不提醒' : `提前${v}分`, value: v })), s.defaultRemindMin, (v) => {
      s.defaultRemindMin = v;
      Store.setSettings(s);
    });

    renderChips($('sEndRemind'), [{ label: '不提醒', value: 0 }, { label: '提前3分', value: 3 }, { label: '提前5分', value: 5 }, { label: '提前10分', value: 10 }], s.endRemindMin, (v) => {
      s.endRemindMin = v;
      Store.setSettings(s);
    });

    $('sBringBook').checked = !!s.remindBringBook;

    $('sAutoSilence').checked = !!s.autoSilence;
    refreshSilenceStatus();

    $('sStart').value = t.startDate;
    $('sTotalWeeks').value = t.totalWeeks;
    $('sApiKey').value = s.apiKey;
    $('sApiBase').value = s.apiBase;
    $('sModel').value = s.model;
    $('keyBox').hidden = s.visionProvider === 'off';
    const tr = $('testResult');
    if (tr) {
      tr.hidden = true;
      tr.textContent = '';
    }

    renderChips($('sProvider'), [{ label: '关闭', value: 'off' }, { label: '智谱', value: 'glm' }, { label: '阿里百炼', value: 'qwen' }, { label: '自定义', value: 'openai' }], s.visionProvider, (v) => {
      s.visionProvider = v;
      Store.setSettings(s);
      renderSettings();
    });

    $('courseCount').textContent = `共 ${Store.getCourses().length} 门课`;

    renderConflictList();

    if (!Scheduler.isNative()) {
      $('pendingInfo').textContent = '当前为网页预览模式，提醒需打包成 App 后生效';
    } else {
      Scheduler.pendingCount().then((n) => {
        $('pendingInfo').textContent = `当前已排提醒：${n >= 0 ? n : '-'} 条`;
      });
    }

    renderAdjustments();
  }

  async function refreshSilenceStatus() {
    const el = $('silenceStatus');
    if (!el) return;
    const S = Scheduler.getSilence();
    if (!S) {
      el.textContent = '网页预览模式不可用，打包成 App 后生效';
      return;
    }
    try {
      const r = await S.canSilence();
      el.textContent = r.granted
        ? '已授权勿扰：上课前自动整手机静音，下课自动恢复，上课/下课前提醒仍会响'
        : '需在系统设置里授权「勿扰 / 修改通知策略」后才会静音（开启时会自动跳转授权页）';
    } catch (e) {
      el.textContent = '';
    }
  }

  async function saveSettingsAndReschedule() {
    const t = Store.getTerm();
    t.startDate = $('sStart').value;
    t.totalWeeks = parseInt($('sTotalWeeks').value, 10) || 20;
    Store.setTerm(t);

    const s = Store.getSettings();
    s.apiKey = $('sApiKey').value;
    s.apiBase = $('sApiBase').value;
    s.model = $('sModel').value;
    Store.setSettings(s);

    const r = await Scheduler.rescheduleAll();
    refreshWeek();
    if (!r.native) toast(`已计算 ${r.count} 条提醒（App 内生效）`);
    else toast(`提醒已重排，共 ${r.count} 条`);
    renderSettings();
  }

  /* ---------- 识别设置：测试连接 ---------- */

  async function testVisionKey() {
    const s = Store.getSettings();
    const box = $('testResult');
    const cfg = {
      visionProvider: s.visionProvider,
      apiKey: ($('sApiKey').value || '').trim(),
      apiBase: ($('sApiBase').value || '').trim(),
      model: ($('sModel').value || '').trim(),
    };

    box.hidden = false;
    if (s.visionProvider === 'off') {
      box.style.color = 'var(--danger)';
      box.textContent = '请先选择服务商（推荐「智谱」）';
      return;
    }
    if (!cfg.apiKey) {
      box.style.color = 'var(--danger)';
      box.textContent = '请先粘贴 API Key';
      return;
    }

    box.style.color = 'var(--text-2)';
    box.textContent = '正在测试连接…';
    const r = await Vision.testConnection(cfg);

    if (r.ok) {
      box.style.color = 'var(--success)';
      box.textContent = `连接成功 · ${r.provider} · ${r.model} · ${r.ms}ms，可以导入课表了`;
      s.apiKey = cfg.apiKey;
      s.apiBase = cfg.apiBase;
      s.model = cfg.model;
      Store.setSettings(s);
      toast('连接成功，Key 已自动保存');
    } else {
      box.style.color = 'var(--danger)';
      box.textContent = '连接失败：' + r.error;
    }
  }

  /* ---------- 通用 ---------- */

  async function afterDataChange(msg) {
    reload();
    const r = await Scheduler.rescheduleAll();
    showPage('home');
    toast(r.native ? `${msg}，已排 ${r.count} 条提醒` : msg);
  }

  function bind() {
    $('btnSettings').onclick = () => showPage('settings');
    $('btnBack').onclick = handleBack;
    $('btnSave').onclick = onSave;

    $('tabSchedule').onclick = () => setTab('schedule');
    $('tabExam').onclick = () => setTab('exam');
    $('btnExport').onclick = exportWeekImage;
    $('btnAddExam').onclick = () => openExam('new');
    $('btnExamCamera').onclick = recognizeExams;
    $('eDelete').onclick = () => {
      if (!confirm('确定删除这场考试？')) return;
      if (state.examEditingId) Store.deleteExam(state.examEditingId);
      state.examEditingId = null;
      $('viewExamEdit').hidden = true;
      $('viewExam').hidden = false;
      $('btnSave').hidden = true;
      renderExam();
      toast('已删除');
    };

    $('prevWeek').onclick = () => { state.week = Math.max(1, state.week - 1); renderHome(); };
    $('nextWeek').onclick = () => { state.week = Math.min(state.term.totalWeeks, state.week + 1); renderHome(); };

    document.querySelectorAll('.switcher .seg').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('.switcher .seg').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        state.viewMode = b.dataset.view;
        renderHome();
      };
    });

    $('fabImport').onclick = () => showPage('import');

    $('btnAddHoliday').onclick = () => {
      const dt = $('newHoliday').value;
      if (!dt) return toast('请选择放假日期');
      const s = Store.getSettings();
      s.adjustments = s.adjustments || { holidays: [], makeup: [] };
      if ((s.adjustments.holidays || []).indexOf(dt) >= 0) return toast('该日期已添加');
      s.adjustments.holidays.push(dt);
      Store.setSettings(s);
      renderAdjustments();
      afterAdjust();
      $('newHoliday').value = '';
    };
    $('btnAddMakeup').onclick = () => {
      const dt = $('newMakeupDate').value;
      const wk = parseInt($('newMakeupWeek').value, 10);
      const dow = parseInt($('newMakeupDow').value, 10);
      if (!dt) return toast('请选择补课日期');
      if (!wk || wk < 1) return toast('请填写第几周');
      const s = Store.getSettings();
      s.adjustments = s.adjustments || { holidays: [], makeup: [] };
      s.adjustments.makeup.push({ date: dt, week: wk, dayOfWeek: dow });
      Store.setSettings(s);
      renderAdjustments();
      afterAdjust();
      $('newMakeupDate').value = '';
      $('newMakeupWeek').value = '';
    };
    $('emptyImport').onclick = () => showPage('import');
    $('emptyAdd').onclick = () => openCourse('new');
    $('fabAdd').onclick = () => openCourse('new');
    $('btnCamera').onclick = () => runRecognize('camera');
    $('btnAlbum').onclick = () => runRecognize('album');
    $('btnImportSelected').onclick = importSelected;
    $('btnPickSheet').onclick = pickSheetFile;
    $('btnParsePaste').onclick = parsePasted;
    $('btnSelAll').onclick = () => {
      state.selected = new Set(state.results.map((_, i) => i));
      renderResults();
    };
    $('btnSelNone').onclick = () => {
      state.selected = new Set();
      renderResults();
    };
    $('btnShiftResultsPrev').onclick = () => { shiftResults(-1); toast('预览已提前一天，确认后再导入'); };
    $('btnShiftResultsNext').onclick = () => { shiftResults(1); toast('预览已延后一天，确认后再导入'); };
    $('btnAutoAlignResults').onclick = autoAlignResults;
    $('btnAutoAlign').onclick = autoAlignToMonFri;

    $('fWeeks').oninput = updateWeeksPreview;
    $('btnDelete').onclick = () => {
      if (!confirm('确定删除这门课？')) return;
      Store.deleteCourse(state.editingId);
      afterDataChange('已删除', true);
    };

    $('btnReschedule').onclick = saveSettingsAndReschedule;
    $('btnSaveRecog').onclick = saveSettingsAndReschedule;
    $('btnTestKey').onclick = testVisionKey;

    $('sBringBook').onchange = () => {
      const s = Store.getSettings();
      s.remindBringBook = $('sBringBook').checked;
      Store.setSettings(s);
    };

    $('sAutoSilence').onchange = async () => {
      const s = Store.getSettings();
      s.autoSilence = $('sAutoSilence').checked;
      Store.setSettings(s);
      if (s.autoSilence) {
        const S = Scheduler.getSilence();
        if (S) {
          try {
            const r = await S.canSilence();
            if (!r.granted) await S.requestPermission();
          } catch (e) {}
        }
      }
      await Scheduler.rescheduleAll();
      await refreshSilenceStatus();
    };

    $('btnShiftPrev').onclick = () => { shiftDayOfWeek(-1); toast('课程已整体提前一天'); };
    $('btnShiftNext').onclick = () => { shiftDayOfWeek(1); toast('课程已整体延后一天'); };

    $('btnDedupe').onclick = () => {
      const removed = Store.dedupeCourses();
      afterDataChange(removed ? `已去掉 ${removed} 门重复课程` : '没有重复课程', true);
    };

    $('btnClear').onclick = () => {
      if (!confirm('确定清空所有课程与提醒？')) return;
      Store.clearCourses();
      localStorage.removeItem('schedule.schemaVersion');
      afterDataChange('已清空', true);
    };
  }

  window.addEventListener('DOMContentLoaded', function () {
    applyTheme();
    reload();
    refreshWeek();
    bind();
    switchImportMode('sheet');
    showPage('home');
    startTodayTimer();
    // 申请通知权限（原生走系统对话框；网页走浏览器原生通知）
    Scheduler.ensureChannel();
    // 注册 Service Worker，离线/重打开都可用
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW register failed', e));
    }
    // 预建「绕过勿扰」的提醒渠道，保证静音时上课提醒仍响
    Scheduler.prepareSilenceChannel();

    // 监听 Android 硬件返回键，复用同一套返回逻辑
    try {
      if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
        const capApp = Capacitor.Plugins && Capacitor.Plugins.App;
        if (capApp && capApp.addListener) capApp.addListener('backButton', handleBack);
      }
    } catch (e) { /* 非原生环境忽略 */ }
  });
})();
