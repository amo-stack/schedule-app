window.App = window.App || {};

App.Scheduler = (function () {
  const CHANNEL_ID = 'class-reminder';

  function plugin() {
    if (typeof window === 'undefined') return null;
    const cap = window.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
    return (cap.Plugins && cap.Plugins.LocalNotifications) || null;
  }

  function isNative() {
    return !!plugin();
  }

  async function ensureChannel() {
    const p = plugin();
    if (!p) return false;
    try {
      await p.requestPermissions();
      if (p.createChannel) {
        await p.createChannel({
          id: CHANNEL_ID,
          name: '上课提醒',
          description: '每节课开始前的提醒',
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
          lightColor: '#4C86F9',
        });
      }
      return true;
    } catch (e) {
      console.warn('channel failed', e);
      return false;
    }
  }

  /**
   * 关键设计：不用「每周重复」触发器（无法表达单双周与起止周），
   * 而是把每门课按学期展开成具体日期，逐条注册一次性精确通知。
   */
  function buildNotifications(courses, term, defaultRemindMin) {
    const now = Date.now();
    const list = [];
    courses.forEach((c, index) => {
      const before = c.remindBeforeMin >= 0 ? c.remindBeforeMin : defaultRemindMin;
      if (before <= 0) return;
      (c.weeks || []).forEach((week) => {
        const day = App.Term.dateOfTermWeek(term.startDate, week, c.dayOfWeek);
        const startAt = App.Term.combineDateTime(day, c.startTime);
        const fireAt = startAt.getTime() - before * 60000;
        if (fireAt <= now) return;
        list.push({
          id: (index + 1) * 1000 + week,
          title: `${before} 分钟后上课 · ${c.name}`,
          body: [c.location, c.teacher, `${c.startTime}-${c.endTime}`].filter(Boolean).join(' · '),
          schedule: { at: new Date(fireAt), allowWhileIdle: true },
          channelId: CHANNEL_ID,
          sound: 'default',
          smallIcon: 'ic_stat_icon_config_sample',
          extra: { courseId: c.id, week },
        });
      });
    });
    return list;
  }

  async function rescheduleAll() {
    const p = plugin();
    const courses = App.Store.getCourses();
    const term = App.Store.getTerm();
    const settings = App.Store.getSettings();
    const list = buildNotifications(courses, term, settings.defaultRemindMin);

    if (!p) {
      return { native: false, count: list.length };
    }

    try {
      await ensureChannel();
      const pending = await p.getPending();
      if (pending && pending.notifications && pending.notifications.length) {
        await p.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
      }
      if (list.length) {
        // Android 单次调度过多易失败，分批提交
        for (let i = 0; i < list.length; i += 50) {
          await p.schedule({ notifications: list.slice(i, i + 50) });
        }
      }
      return { native: true, count: list.length };
    } catch (e) {
      console.warn('schedule failed', e);
      return { native: true, count: 0, error: String(e) };
    }
  }

  async function pendingCount() {
    const p = plugin();
    if (!p) return -1;
    try {
      const r = await p.getPending();
      return (r.notifications || []).length;
    } catch (e) {
      return -1;
    }
  }

  return { isNative, ensureChannel, rescheduleAll, pendingCount, buildNotifications };
})();
