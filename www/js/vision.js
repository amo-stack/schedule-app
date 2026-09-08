window.App = window.App || {};

App.Vision = (function () {
  const PROVIDERS = {
    glm: { base: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4v-flash', name: '智谱 GLM-4V' },
    qwen: { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen2.5-vl-72b-instruct', name: '阿里百炼' },
    openai: { base: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini', name: '自定义' },
  };

  const SYSTEM_PROMPT = `你是一个中文课表识别助手。请从图片中识别所有课程，输出严格的 JSON 数组，不要输出任何解释文字、不要 markdown 代码块。

数组每个元素字段：
- name: 课程名称（必填，去掉换行）
- teacher: 任课教师，没有则 null
- location: 上课地点/教室，没有则 null
- dayOfWeek: 星期几，1=周一 ... 7=周日（数字）
- startTime: "HH:MM" 24小时制
- endTime: "HH:MM" 24小时制
- startSection: 开始节次（数字，无则 null）
- endSection: 结束节次（数字，无则 null）
- weeksExpr: 上课周次原文，如 "1-16周" "1-16周(双)" "3,5,7周"，没有则 null
- confidence: 0-1 的置信度数字

要求：
1. 一格多门课（不同周次）要拆成多条。
2. 跨节次的课只输出一条，startSection/endSection 标明跨度。
3. 无法确定就填 null，不要编造。
4. 课表上若标注了节次（如"第1-2节"、左侧节次列、表头的 1 2 3 4），startSection 和 endSection 必须填数字，不要填 null。
5. 从图片推断不出的节次，就按该行的上课时间估：08:00 附近=第1节，10:00 附近=第3节，14:00 附近=第5节，16:00 附近=第7节，19:00 附近=第9节。`;

  function requestError(message, status) {
    const e = new Error(message);
    e.status = status;
    return e;
  }

  async function post(url, headers, body) {
    const cap = window.Capacitor;
    const http = cap && cap.Plugins && cap.Plugins.CapacitorHttp;
    if (http) {
      const res = await http.post({ url, headers, data: body });
      if (res.status < 200 || res.status >= 300) {
        throw requestError(`接口返回 ${res.status}: ${JSON.stringify(res.data).slice(0, 160)}`, res.status);
      }
      return typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    }
    const r = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) throw requestError(`接口返回 ${r.status}: ${(await r.text()).slice(0, 160)}`, r.status);
    return r.json();
  }

  /** 把 HTTP 状态码翻译成人话 */
  function explain(status) {
    if (status === 401 || status === 403) return 'API Key 无效或没权限，请检查是否复制完整';
    if (status === 404) return '接口地址或模型名不存在，请检查「接口地址」和「模型名」';
    if (status === 429) return '请求太频繁或额度用完了，稍后再试';
    if (status >= 500) return '服务商服务器故障，稍后再试';
    return '';
  }

  function extractJson(text) {
    let cleaned = String(text || '')
      .replace(/```(?:json)?/g, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      const s = cleaned.indexOf('[');
      const end = cleaned.lastIndexOf(']');
      if (s >= 0 && end > s) {
        try {
          return JSON.parse(cleaned.slice(s, end + 1));
        } catch (e2) {
          return null;
        }
      }
      return null;
    }
  }

  function normalizeItem(x) {
    if (!x || typeof x !== 'object') return null;
    const name = String(x.name || '').trim();
    if (!name) return null;
    return {
      name,
      teacher: x.teacher ? String(x.teacher).trim() : undefined,
      location: x.location ? String(x.location).trim() : undefined,
      dayOfWeek: Number(x.dayOfWeek) || 1,
      startTime: x.startTime ? String(x.startTime) : undefined,
      endTime: x.endTime ? String(x.endTime) : undefined,
      startSection: x.startSection ? Number(x.startSection) : undefined,
      endSection: x.endSection ? Number(x.endSection) : undefined,
      weeksExpr: x.weeksExpr ? String(x.weeksExpr) : undefined,
      confidence: typeof x.confidence === 'number' ? x.confidence : undefined,
    };
  }

  /** 测试连接：发一条极短请求，验证 Key / 地址 / 模型名是否可用 */
  async function testConnection(settings) {
    const key = (settings.apiKey || '').trim();
    if (!key) return { ok: false, error: '请先填写 API Key' };

    const p = PROVIDERS[settings.visionProvider] || PROVIDERS.glm;
    const endpoint = (settings.apiBase || '').trim() || p.base;
    const model = (settings.model || '').trim() || p.model;

    const t0 = Date.now();
    try {
      const json = await post(
        endpoint,
        { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        { model, temperature: 0, max_tokens: 16, messages: [{ role: 'user', content: '回复两个字：正常' }] }
      );
      return { ok: true, provider: p.name, model, ms: Date.now() - t0 };
    } catch (e) {
      const hint = explain(e && e.status);
      return { ok: false, error: hint || ((e && e.message) || String(e)) };
    }
  }

  async function recognize(base64, settings) {
    const key = (settings.apiKey || '').trim();
    if (!key) return { ok: false, error: '未配置 API Key' };

    const p = PROVIDERS[settings.visionProvider] || PROVIDERS.glm;
    const endpoint = (settings.apiBase || '').trim() || p.base;
    const model = (settings.model || '').trim() || p.model;

    const body = {
      model,
      temperature: 0.1,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: '请识别这张课表，输出 JSON 数组。' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } },
          ],
        },
      ],
    };

    try {
      const json = await post(endpoint, { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body);
      const content = json && json.choices && json.choices[0] && json.choices[0].message
        ? json.choices[0].message.content
        : '';
      const parsed = extractJson(Array.isArray(content) ? JSON.stringify(content) : content);
      if (!Array.isArray(parsed)) return { ok: false, error: '模型未返回可解析的 JSON 数组' };
      const items = parsed.map(normalizeItem).filter(Boolean);
      if (!items.length) return { ok: false, error: '未识别到课程' };
      return { ok: true, items };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  }

  /** 压缩到 1280 宽，返回纯 base64 */
  function compress(dataUrl, maxWidth) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = function () {
        const w = Math.min(img.width, maxWidth || 1280);
        const ratio = w / img.width;
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  /** 选图：原生走 Capacitor Camera，网页走 input file */
  function pickImage(source) {
    return new Promise((resolve, reject) => {
      const cap = window.Capacitor;
      const camera = cap && cap.Plugins && cap.Plugins.Camera;
      if (camera) {
        camera
          .getPhoto({
            source: source === 'camera' ? 'CAMERA' : 'PHOTOS',
            resultType: 'dataUrl',
            quality: 90,
          })
          .then((photo) => resolve(photo.dataUrl))
          .catch(reject);
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (source === 'camera') input.capture = 'environment';
      input.onchange = function () {
        const file = input.files && input.files[0];
        if (!file) return reject(new Error('未选择文件'));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }

  return { PROVIDERS, recognize, compress, pickImage, testConnection };
})();
