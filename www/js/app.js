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
    week: 1,
    day: new Date().getDay() === 0 ? 7 : new Date().getDay(),
    editingId: null,
    editing: null,
    results: [],
    selected: new Set(),
    term: Store.getTerm(),
    settings: Store.getSettings(),
    courses: Store.getCourses(),
  };

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

  /* ---------- 首页 ---------- */

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

    if (empty) return;

    if (state.viewMode === 'week') renderGrid();
    else renderDay();
  }

  function renderGridHead() {
    const head = $('gridHead');
    head.innerHTML = '';
    const today = todayDow();
    const monday = Term.dateOfTermWeek(state.term.startDate, state.week, 1);
    for (let d = 1; d <= 7; d++) {
      const date = Term.addDays(monday, d - 1);
      const md = date.getMonth() * 100 + date.getDate();
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

  function renderGrid() {
    renderGridHead();
    const sections = state.settings.sectionTimes;
    const visible = state.courses.filter((c) => (c.weeks || []).indexOf(state.week) >= 0);
    const body = $('gridBody');
    const today = todayDow();
    body.innerHTML = '';

    sections.forEach((s, i) => {
      const t = document.createElement('div');
      t.className = 'cell-time';
      t.style.gridColumn = '1';
      t.style.gridRow = String(i + 1);
      t.innerHTML = `<b>${s.index}</b><span>${s.start}</span>`;
      body.appendChild(t);

      for (let d = 1; d <= 7; d++) {
        const c = visible.find((x) => x.dayOfWeek === d && x.startSection === s.index);
        if (c) {
          const span = Math.max(1, (c.endSection || c.startSection) - c.startSection + 1);
          const b = document.createElement('div');
          b.className = 'course-block' + (span === 1 ? ' short' : '');
          b.style.gridColumn = String(d + 1);
          b.style.gridRow = `${i + 1} / span ${span}`;
          b.style.setProperty('--cbg', c.color);
          b.style.setProperty('--cbg2', lighten(c.color, 26));
          b.innerHTML = `<div class="n"></div><div class="p"></div>`;
          b.querySelector('.n').textContent = c.name;
          b.querySelector('.p').textContent = c.location || '';
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
  }

  function renderDay() {
    const tabs = $('dayTabs');
    tabs.innerHTML = '';
    WEEK_LABELS.forEach((l, i) => {
      const b = document.createElement('button');
      b.textContent = l;
      if (state.day === i + 1) b.className = 'active';
      b.onclick = () => { state.day = i + 1; renderDay(); };
      tabs.appendChild(b);
    });

    const list = state.courses
      .filter((c) => c.dayOfWeek === state.day && (c.weeks || []).indexOf(state.week) >= 0)
      .sort((a, b) => a.startSection - b.startSection);

    const wrap = $('dayList');
    wrap.innerHTML = '';
    if (!list.length) {
      wrap.innerHTML = '<p style="text-align:center;color:#999;padding:40px 0">这天没有课</p>';
      return;
    }
    list.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'day-item';
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.background = c.color;
      const info = document.createElement('div');
      info.className = 'info';
      const t = document.createElement('div');
      t.className = 't';
      t.textContent = c.name;
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
      status.hidden = true;
      resultBox.hidden = false;
      $('resultHint').textContent = `识别到 ${res.items.length} 条，取消勾选不需要的：`;
      renderResults();
    } catch (e) {
      status.innerHTML = `<span style="color:#C0392B">出错了：${e && e.message ? e.message : e}</span>`;
    }
  }

  function renderResults() {
    const box = $('resultList');
    box.innerHTML = '';
    const term = Store.getTerm();

    state.results.forEach((it, i) => {
      const on = state.selected.has(i);
      const div = document.createElement('div');
      div.className = 'result-item' + (on ? '' : ' off');
      const parsed = Weeks.parseWeeksExpr(it.weeksExpr || '', term.totalWeeks);
      div.innerHTML = `
        <div class="mark">${on ? '[x]' : '[ ]'}</div>
        <div>
          <div class="n"></div>
          <div class="m"></div>
          <div class="m" style="color:#AAA"></div>
        </div>`;
      const texts = div.querySelectorAll('.n, .m');
      texts[0].textContent = it.name;
      texts[1].textContent = `周${WEEK_LABELS[(it.dayOfWeek || 1) - 1]}${it.startTime ? ' ' + it.startTime + '-' + it.endTime : ''}${it.startSection ? ' 第' + it.startSection + '节' : ''}`;
      texts[2].textContent = [it.location, it.teacher, '周次：' + Weeks.describeWeeks(parsed.weeks, term.totalWeeks)].filter(Boolean).join(' · ');
      div.onclick = () => {
        if (state.selected.has(i)) state.selected.delete(i);
        else state.selected.add(i);
        renderResults();
      };
      box.appendChild(div);
    });
  }

  function guessSection(hhmm, sections) {
    if (!hhmm) return 1;
    const m = String(hhmm).match(/(\d{1,2}):(\d{2})/);
    if (!m) return 1;
    const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    let best = sections[0];
    let bestDiff = Infinity;
    sections.forEach((s) => {
      const sm = s.start.match(/(\d{1,2}):(\d{2})/);
      if (!sm) return;
      const d = Math.abs(parseInt(sm[1], 10) * 60 + parseInt(sm[2], 10) - t);
      if (d < bestDiff) { bestDiff = d; best = s; }
    });
    return best.index;
  }

  function importSelected() {
    const term = Store.getTerm();
    const settings = Store.getSettings();
    const chosen = state.results.filter((_, i) => state.selected.has(i));
    if (!chosen.length) return toast('请至少选择一门课');

    chosen.forEach((it) => {
      const p = Weeks.parseWeeksExpr(it.weeksExpr || '', term.totalWeeks);
      const startSection = it.startSection || guessSection(it.startTime, settings.sectionTimes);
      const endSection = it.endSection || startSection;
      const s0 = settings.sectionTimes.find((x) => x.index === startSection);
      const s1 = settings.sectionTimes.find((x) => x.index === endSection);
      Store.upsertCourse({
        id: Store.newId(),
        name: it.name,
        teacher: it.teacher,
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
      });
    });

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
    e.location = $('fLocation').value.trim();
    e.startTime = $('fStart').value;
    e.endTime = $('fEnd').value;
    Store.upsertCourse(e);
    afterDataChange('已保存', false);
  }

  /* ---------- 设置 ---------- */

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
      applyTheme();
    });

    renderChips($('sRemind'), Store.REMIND_OPTIONS.map((v) => ({ label: v === 0 ? '不提醒' : `提前${v}分`, value: v })), s.defaultRemindMin, (v) => {
      s.defaultRemindMin = v;
      Store.setSettings(s);
    });

    $('sStart').value = t.startDate;
    $('sTotalWeeks').value = t.totalWeeks;
    $('sApiKey').value = s.apiKey;
    $('sApiBase').value = s.apiBase;
    $('sModel').value = s.model;
    $('keyBox').hidden = s.visionProvider === 'off';

    renderChips($('sProvider'), [{ label: '关闭', value: 'off' }, { label: '智谱', value: 'glm' }, { label: '阿里百炼', value: 'qwen' }, { label: '自定义', value: 'openai' }], s.visionProvider, (v) => {
      s.visionProvider = v;
      Store.setSettings(s);
      renderSettings();
    });

    $('courseCount').textContent = `共 ${Store.getCourses().length} 门课`;

    if (!Scheduler.isNative()) {
      $('pendingInfo').textContent = '当前为网页预览模式，提醒需打包成 App 后生效';
    } else {
      Scheduler.pendingCount().then((n) => {
        $('pendingInfo').textContent = `当前已排提醒：${n >= 0 ? n : '-'} 条`;
      });
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

  /* ---------- 通用 ---------- */

  async function afterDataChange(msg) {
    reload();
    const r = await Scheduler.rescheduleAll();
    showPage('home');
    toast(r.native ? `${msg}，已排 ${r.count} 条提醒` : msg);
  }

  function bind() {
    $('btnSettings').onclick = () => showPage('settings');
    $('btnBack').onclick = () => showPage('home');
    $('btnSave').onclick = saveCourse;

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
    $('emptyImport').onclick = () => showPage('import');
    $('emptyAdd').onclick = () => openCourse('new');
    $('btnCamera').onclick = () => runRecognize('camera');
    $('btnAlbum').onclick = () => runRecognize('album');
    $('btnImportSelected').onclick = importSelected;

    $('fWeeks').oninput = updateWeeksPreview;
    $('btnDelete').onclick = () => {
      if (!confirm('确定删除这门课？')) return;
      Store.deleteCourse(state.editingId);
      afterDataChange('已删除', true);
    };

    $('btnReschedule').onclick = saveSettingsAndReschedule;
    $('btnSaveRecog').onclick = saveSettingsAndReschedule;
    $('btnClear').onclick = () => {
      if (!confirm('确定清空所有课程与提醒？')) return;
      Store.clearCourses();
      afterDataChange('已清空', true);
    };
  }

  window.addEventListener('DOMContentLoaded', function () {
    applyTheme();
    reload();
    refreshWeek();
    bind();
    showPage('home');
    // 申请通知权限（原生走系统对话框；网页走浏览器原生通知）
    Scheduler.ensureChannel();
    // 注册 Service Worker，离线/重打开都可用
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW register failed', e));
    }
  });
})();
