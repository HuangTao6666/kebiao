(function () {
  'use strict';

  const LS_KEY = 'kebiao.v1';
  const DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const PALETTE = [
    '#2f6bff', '#7a4dff', '#e5484d', '#12a594', '#e8590c', '#0b7285',
    '#d6336c', '#4263eb', '#2b8a3e', '#c92a2a', '#7048e8', '#087f5b'
  ];

  const DEFAULTS = { semesterStart: '2026-09-07', daysPerWeek: 7, periodCount: 12 };

  const state = {
    settings: { ...DEFAULTS },
    courses: [],
    viewOffset: 0,
    lastDate: '',
    tab: 'week',
    updatedAt: 0
  };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function parseDate(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return new Date();
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const wd = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - wd);
    return x;
  }
  function weekNumberFor(date) {
    const start = mondayOf(parseDate(state.settings.semesterStart));
    const cur = mondayOf(date);
    return Math.floor((cur - start) / (7 * 86400000)) + 1;
  }
  function weekMonday(offset) {
    const m = mondayOf(new Date());
    m.setDate(m.getDate() + (offset || 0) * 7);
    return m;
  }
  function fmtMD(d) { return (d.getMonth() + 1) + '月' + d.getDate() + '日'; }
  function fmtFull(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function sameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function todayStr() { return fmtFull(new Date()); }

  function colorFor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  function spansOf(periods) {
    const arr = (periods || []).slice().sort((a, b) => a - b);
    const out = [];
    let start = arr[0];
    let prev = arr[0];
    for (let i = 1; i <= arr.length; i++) {
      if (arr[i] === prev + 1) { prev = arr[i]; continue; }
      out.push([start, prev]);
      start = prev = arr[i];
    }
    return out;
  }

  function activeIn(course, week) {
    return !course.weeks || !course.weeks.length || course.weeks.includes(week);
  }

  /* ---------- 存储 ---------- */
  function save() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        settings: state.settings,
        courses: state.courses,
        updatedAt: Date.now()
      }));
      state.updatedAt = Date.now();
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        state.settings = Object.assign({}, DEFAULTS, d.settings || {});
        state.courses = Array.isArray(d.courses) ? d.courses : [];
        state.updatedAt = d.updatedAt || 0;
      }
    } catch (e) { /* 忽略损坏数据 */ }
    state.lastDate = todayStr();
  }

  function applyData(settings, courses, sourceLabel) {
    state.settings = Object.assign({}, DEFAULTS, settings || {});
    const maxPeriod = Math.max(0, ...courses.map((c) => Math.max(0, ...(c.periods || []))));
    state.settings.periodCount = Math.max(state.settings.periodCount, maxPeriod, 12);
    state.courses = courses.map((c, i) => ({ ...c, id: c.id || 'c' + i }));
    state.viewOffset = 0;
    save();
    renderAll();
    toast('已载入 ' + courses.length + ' 条课程记录' + (sourceLabel ? '（' + sourceLabel + '）' : ''));
  }

  /* ---------- 周课表视图 ---------- */
  function renderWeek() {
    const monday = weekMonday(state.viewOffset);
    const sunday = new Date(monday.getTime() + (state.settings.daysPerWeek - 1) * 86400000);
    const week = weekNumberFor(monday);
    const today = new Date();

    $('week-title').textContent = '第 ' + week + ' 周';
    $('week-dates').textContent = fmtMD(monday) + ' - ' + fmtMD(sunday);
    $('week-badge').textContent = sameDate(monday, mondayOf(today)) ? '本周' : (state.viewOffset === 0 ? '本周' : '');
    $('btn-back-today').disabled = state.viewOffset === 0;

    const days = state.settings.daysPerWeek;
    const grid = $('week-grid');
    grid.style.setProperty('--days', days);
    grid.innerHTML = '';

    // 星期表头
    for (let d = 1; d <= days; d++) {
      const date = new Date(monday.getTime() + (d - 1) * 86400000);
      const el = document.createElement('div');
      el.className = 'day-head' + (sameDate(date, today) ? ' is-today' : '');
      el.style.gridColumn = (d + 1);
      el.style.gridRow = 1;
      el.innerHTML = '<span class="day-name">' + DAY_LABELS[d - 1] + '</span>' +
        '<span class="day-date">' + (date.getMonth() + 1) + '/' + date.getDate() + '</span>';
      grid.appendChild(el);
    }

    // 节次标签
    for (let p = 1; p <= state.settings.periodCount; p++) {
      const el = document.createElement('div');
      el.className = 'period-label';
      el.style.gridColumn = 1;
      el.style.gridRow = p + 1;
      el.textContent = p;
      grid.appendChild(el);
    }

    // 课程块
    const items = state.courses.filter((c) => !c.noTime && c.day >= 1 && c.day <= days && activeIn(c, week));
    for (const c of items) {
      const color = colorFor(c.name);
      for (const [s, e] of spansOf(c.periods)) {
        const el = document.createElement('button');
        el.className = 'course-chip';
        el.style.gridColumn = c.day + 1;
        el.style.gridRow = (s + 1) + ' / ' + (e + 2);
        el.style.background = color;
        el.dataset.id = c.id;
        const badge = c.weeks && c.weeks.length ? '<span class="chip-week">' + esc(c.weekText) + '</span>' : '';
        el.innerHTML = '<span class="chip-name">' + esc(c.name) + '</span>' +
          (c.room ? '<span class="chip-room">' + esc(c.room) + '</span>' : '') + badge;
        grid.appendChild(el);
      }
    }

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'week-empty';
      empty.style.gridColumn = '1 / -1';
      empty.style.gridRow = '2 / -1';
      empty.innerHTML = '<p>本周没有课程 🎉</p><p class="sub">可以点击 ‹ › 查看其它周</p>';
      grid.appendChild(empty);
    }

    // 本周的“占周不占时间”安排
    const others = state.courses.filter((c) => c.noTime && activeIn(c, week));
    const box = $('other-box');
    if (others.length) {
      box.hidden = false;
      box.innerHTML = '<div class="other-title">其他安排（不占节次）</div>' + others.map((c) =>
        '<button class="other-card" data-id="' + c.id + '">' +
        '<span class="chip-name">' + esc(c.name) + '</span>' +
        '<span class="other-meta">' + esc([c.teacher, c.weekText].filter(Boolean).join(' · ')) + '</span>' +
        '</button>').join('');
    } else {
      box.hidden = true;
    }

    bindChipClicks();
  }

  /* ---------- 今日视图 ---------- */
  function renderToday() {
    const today = new Date();
    const week = weekNumberFor(today);
    const dow = (today.getDay() + 6) % 7 + 1;
    $('today-title').textContent = fmtFull(today) + ' ' + DAY_LABELS[dow - 1] + ' · 第 ' + week + ' 周';

    const items = state.courses
      .filter((c) => !c.noTime && c.day === dow && activeIn(c, week))
      .sort((a, b) => (a.periods[0] || 0) - (b.periods[0] || 0));
    const others = state.courses.filter((c) => c.noTime && activeIn(c, week));
    const box = $('today-list');
    box.innerHTML = '';

    if (!items.length && !others.length) {
      box.innerHTML = '<div class="today-empty">今天没有课 🎉</div>';
      return;
    }
    for (const c of items) {
      const el = document.createElement('button');
      el.className = 'today-card';
      el.dataset.id = c.id;
      el.style.borderLeftColor = colorFor(c.name);
      el.innerHTML =
        '<div class="today-main">' +
        '<div class="today-name">' + esc(c.name) + '</div>' +
        '<div class="today-meta">' + esc([c.periodText, c.room, c.teacher].filter(Boolean).join(' · ')) + '</div>' +
        '</div>' +
        (c.weeks && c.weeks.length ? '<div class="today-week">' + esc(c.weekText) + '</div>' : '');
      box.appendChild(el);
    }
    for (const c of others) {
      const el = document.createElement('button');
      el.className = 'today-card other';
      el.dataset.id = c.id;
      el.innerHTML =
        '<div class="today-main">' +
        '<div class="today-name">' + esc(c.name) + '</div>' +
        '<div class="today-meta">' + esc([c.teacher, '不占节次'].filter(Boolean).join(' · ')) + '</div>' +
        '</div>' +
        (c.weeks && c.weeks.length ? '<div class="today-week">' + esc(c.weekText) + '</div>' : '');
      box.appendChild(el);
    }
    bindChipClicks();
  }

  /* ---------- 设置视图 ---------- */
  function renderSettings() {
    $('set-start').value = state.settings.semesterStart;
    $('set-days').value = String(state.settings.daysPerWeek);
    $('set-periods').value = String(state.settings.periodCount);
    const now = new Date();
    $('set-hint').textContent = '按当前设置，今天是第 ' + weekNumberFor(now) + ' 周（' + fmtFull(now) + '）';
    const stats = state.courses.length ? state.courses.length + ' 条课程记录' : '还没有课程数据';
    $('data-stats').textContent = stats + (state.updatedAt ? ' · 更新于 ' + fmtFull(new Date(state.updatedAt)) : '');
  }

  function renderAll() {
    renderWeek();
    renderToday();
    renderSettings();
    const has = state.courses.length > 0;
    $('onboarding').hidden = has;
    $('app-main').hidden = !has;
    $('bottom-nav').hidden = !has;
    showTab(state.tab);
  }

  function showTab(name) {
    state.tab = name;
    ['week', 'today', 'settings'].forEach((t) => {
      $('view-' + t).hidden = t !== name;
      $('tab-' + t).classList.toggle('active', t === name);
    });
    if (name === 'settings') renderSettings();
    window.scrollTo(0, 0);
  }

  function bindChipClicks() {
    document.querySelectorAll('[data-id]').forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', () => openDetail(el.dataset.id));
    });
  }

  function openDetail(id) {
    const c = state.courses.find((x) => String(x.id) === String(id));
    if (!c) return;
    const rows = [
      ['课程', c.name],
      ['星期', c.noTime ? '不限（不占节次）' : DAY_LABELS[(c.day || 1) - 1]],
      ['节次', c.periodText || '—'],
      ['周次', c.weekText || '全学期'],
      ['教室', c.room || '—'],
      ['教师', c.teacher || '—'],
      ['性质', [c.nature, c.exam].filter(Boolean).join(' · ') || '—']
    ];
    if (c.note) rows.push(['备注', c.note]);
    $('modal-title').textContent = c.name;
    $('modal-body').innerHTML = rows.map(([k, v]) =>
      '<div class="detail-row"><div class="detail-key">' + k + '</div><div class="detail-val">' + esc(v) + '</div></div>'
    ).join('');
    $('modal').hidden = false;
  }

  /* ---------- 数据导入 ---------- */
  async function importFile(file) {
    if (!file) return;
    try {
      toast('正在解析文件…');
      const buf = await file.arrayBuffer();
      const parsed = await KBParser.parseFile(buf, file.name);
      if (!parsed || !parsed.courses.length) throw new Error('没有解析到课程');
      applyData({ semesterStart: state.settings.semesterStart, daysPerWeek: state.settings.daysPerWeek, periodCount: parsed.maxPeriod || 12 }, parsed.courses, file.name);
    } catch (e) {
      toast('解析失败：' + (e.message || e), 3600);
    } finally {
      $('file-input').value = '';
    }
  }

  function importPaste() {
    const text = $('paste-text').value;
    if (!text.trim()) { toast('请先粘贴表格内容'); return; }
    try {
      const parsed = KBParser.parseGridText(text);
      if (!parsed || !parsed.courses.length) throw new Error('没有解析到课程');
      applyData({ semesterStart: state.settings.semesterStart, daysPerWeek: state.settings.daysPerWeek, periodCount: parsed.maxPeriod || 12 }, parsed.courses, '粘贴内容');
      $('paste-text').value = '';
    } catch (e) {
      toast('解析失败：' + (e.message || e), 3600);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ settings: state.settings, courses: state.courses }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '课表数据.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('已导出数据文件');
  }

  function loadBuiltin() {
    const b = window.BUILTIN_SCHEDULE;
    if (!b || !b.courses || !b.courses.length) { toast('没有内置课表数据'); return; }
    applyData(b.settings, b.courses, '内置课表');
    showTab('week');
  }

  function clearData() {
    if (!confirm('确定清空所有课表数据吗？')) return;
    state.courses = [];
    state.viewOffset = 0;
    save();
    renderAll();
    toast('已清空数据');
  }

  /* ---------- 提示与安装 ---------- */
  let toastTimer = null;
  function toast(msg, ms) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms || 2200);
  }

  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $('btn-install').hidden = false;
  });

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    $('btn-prev').addEventListener('click', () => { state.viewOffset--; renderWeek(); });
    $('btn-next').addEventListener('click', () => { state.viewOffset++; renderWeek(); });
    $('btn-back-today').addEventListener('click', () => { state.viewOffset = 0; renderWeek(); });
    $('btn-install').addEventListener('click', async () => {
      if (!deferredPrompt) { toast('请通过浏览器菜单“添加到主屏幕”安装'); return; }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      $('btn-install').hidden = true;
    });

    $('tab-week').addEventListener('click', () => showTab('week'));
    $('tab-today').addEventListener('click', () => showTab('today'));
    $('tab-settings').addEventListener('click', () => showTab('settings'));

    $('btn-save-settings').addEventListener('click', () => {
      const start = $('set-start').value;
      if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(start)) { toast('请选择正确的学期开始日期'); return; }
      state.settings.semesterStart = start;
      state.settings.daysPerWeek = Math.min(7, Math.max(5, Number($('set-days').value) || 7));
      state.settings.periodCount = Math.min(30, Math.max(8, Number($('set-periods').value) || 12));
      state.viewOffset = 0;
      save();
      renderAll();
      toast('设置已保存');
    });

    $('btn-import').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', (e) => importFile(e.target.files && e.target.files[0]));
    $('btn-paste-parse').addEventListener('click', importPaste);
    $('btn-export').addEventListener('click', exportJson);
    $('btn-builtin').addEventListener('click', loadBuiltin);
    $('btn-clear').addEventListener('click', clearData);

    $('ob-import').addEventListener('click', () => $('file-input').click());
    $('ob-paste').addEventListener('click', () => { showTab('settings'); $('paste-text').focus(); });
    $('ob-builtin').addEventListener('click', loadBuiltin);

    $('modal-close').addEventListener('click', () => { $('modal').hidden = true; });
    $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').hidden = true; });

    // 日期变化时自动回到本周
    const refreshIfNewDay = () => {
      const s = todayStr();
      if (s !== state.lastDate) {
        state.lastDate = s;
        state.viewOffset = 0;
        renderAll();
      }
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshIfNewDay(); });
    window.addEventListener('focus', refreshIfNewDay);
    setInterval(refreshIfNewDay, 60 * 1000);
  }

  /* ---------- 启动 ---------- */
  load();
  if (/[?&]demo=1/.test(location.search) && !state.courses.length) {
    const b = window.BUILTIN_SCHEDULE;
    if (b && b.courses) {
      state.settings = Object.assign({}, DEFAULTS, b.settings || {});
      state.courses = b.courses.map((c, i) => ({ ...c, id: 'c' + i }));
    }
  }
  bindEvents();
  renderAll();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
