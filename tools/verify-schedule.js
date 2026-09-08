/**
 * 一条龙验证：真实 xls 课表 → 解析 → 展开周次 → 排提醒
 *
 * 用法：
 *   node tools/verify-schedule.js [课表文件路径]
 * 默认读 D:\zz\25现代物流管理(01)班课表.xls
 * 需要 node_modules/xlsx（npm i xlsx）
 */
const path = require('path');
const fs = require('fs');

const FILE = process.argv[2] || 'D:/zz/25现代物流管理(01)班课表.xls';

const mem = {};
global.localStorage = {
  getItem: (k) => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: (k) => { delete mem[k]; },
};
global.window = { localStorage: global.localStorage };
global.App = {};
global.window.App = global.App;

require(path.join(__dirname, '../www/js/weeks.js'));
require(path.join(__dirname, '../www/js/term.js'));
require(path.join(__dirname, '../www/js/store.js'));
require(path.join(__dirname, '../www/js/scheduler.js'));
require(path.join(__dirname, '../www/js/xlsParse.js'));

const A = global.App;
const DOW = ['日', '一', '二', '三', '四', '五', '六'];

function fdt(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

let XLSX;
try {
  XLSX = require('xlsx');
} catch (e) {
  console.error('缺少 xlsx 依赖，请先执行: npm i xlsx');
  process.exit(1);
}

const wb = XLSX.read(new Uint8Array(fs.readFileSync(FILE)), { type: 'array' });
const cells = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', blankrows: false });
const r = A.XlsParse.parseCells(cells);
if (!r.ok) {
  console.error('解析失败:', r.error);
  process.exit(1);
}

const term = { startDate: (r.term && r.term.startDate) || '2026-09-07', totalWeeks: (r.term && r.term.totalWeeks) || 20 };
console.log('文件:', FILE);
console.log('学期:', term.startDate, '起，共', term.totalWeeks, '周｜起始日是星期' + DOW[new Date(term.startDate).getDay()]);
console.log('末周最后一天:', fdt(A.Term.dateOfTermWeek(term.startDate, term.totalWeeks, 7)).slice(0, 10));

const SECTION_TIME = {
  1: ['08:00', '09:40'], 3: ['10:00', '11:40'], 5: ['14:00', '15:40'],
  7: ['16:00', '17:40'], 9: ['19:00', '20:40'], 11: ['20:50', '21:35'],
};

const courses = r.items.map((it, i) => {
  const p = A.Weeks.parseWeeksExpr(it.weeksExpr || '', term.totalWeeks);
  const t = SECTION_TIME[it.startSection] || ['08:00', '08:45'];
  return {
    id: 'c' + i,
    name: it.name,
    dayOfWeek: it.dayOfWeek,
    startSection: it.startSection,
    endSection: it.endSection,
    weeks: p.weeks,
    weekPattern: p.pattern,
    weeksExpr: it.weeksExpr || '',
    location: it.location || '',
    teacher: it.teacher || '',
    startTime: t[0],
    endTime: t[1],
    remindBeforeMin: -1,
  };
});

let total = 0;
courses.forEach((c) => { total += c.weeks.length; });
console.log('\n课程', courses.length, '门，展开后课次', total, '节');
(r.warnings || []).forEach((w) => console.log('  提醒:', w));

const list = A.Scheduler.buildNotifications(courses, term, 20);
console.log('可排提醒', list.length, '条（已过滤掉过去的）');

console.log('\n最早 8 条：');
list.slice().sort((a, b) => a.schedule.at - b.schedule.at).slice(0, 8).forEach((n) => {
  const d = n.schedule.at;
  console.log('  ' + fdt(d) + ' 周' + DOW[d.getDay()] + '  ' + n.title + '  | ' + n.body);
});

console.log('\n各课课次数：');
const by = {};
courses.forEach((c) => { by[c.name] = (by[c.name] || 0) + c.weeks.length; });
Object.keys(by).forEach((k) => console.log('  ' + k + ': ' + by[k]));
