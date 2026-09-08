# -*- coding: utf-8 -*-
"""用一张课表图验证视觉识别链路（复现 App 里的请求与 prompt）

用法：
  python tools/verify-vision.py <API_KEY> [图片路径]
默认图片为项目根 _sample-timetable.png
"""
import sys, os, json, base64, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_IMG = os.path.join(ROOT, "_sample-timetable.png")
ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
MODEL = "glm-4v-flash"

SYSTEM_PROMPT = """你是一个中文课表识别助手。请从图片中识别所有课程，输出严格的 JSON 数组，不要输出任何解释文字、不要 markdown 代码块。

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
5. 从图片推断不出的节次，就按该行的上课时间估：08:00 附近=第1节，10:00 附近=第3节，14:00 附近=第5节，16:00 附近=第7节，19:00 附近=第9节。"""


def main():
    if len(sys.argv) < 2:
        print("用法: python tools/verify-vision.py <API_KEY> [图片路径]")
        return 1
    key = sys.argv[1]
    img = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_IMG
    if not os.path.exists(img):
        print("图片不存在:", img)
        return 1

    with open(img, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()

    body = {
        "model": MODEL,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "text", "text": "请识别这张课表，输出 JSON 数组。"},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64," + b64}},
            ]},
        ],
    }

    req = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
        method="POST",
    )

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print("HTTP 错误 %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:300]))
        return 1
    except Exception as e:
        print("请求失败:", e)
        return 1
    ms = int((time.time() - t0) * 1000)

    content = data["choices"][0]["message"]["content"]
    print("耗时 %dms，模型 %s" % (ms, data.get("model")))
    print("---- 原始返回 ----")
    print(content[:2000])

    txt = content.replace("```json", "").replace("```", "").strip()
    s, e = txt.find("["), txt.rfind("]")
    if s < 0 or e <= s:
        print("\n[FAIL] 未返回 JSON 数组")
        return 1
    try:
        items = json.loads(txt[s:e + 1])
    except Exception as ex:
        print("\n[FAIL] JSON 解析失败:", ex)
        return 1

    print("\n---- 解析结果 %d 门课 ----" % len(items))
    for it in items:
        print("  %-8s 周%d 第%s-%s节 %s~%s  %s  %s  %s  置信%.2f" % (
            it.get("name"), it.get("dayOfWeek"), it.get("startSection"), it.get("endSection"),
            it.get("startTime"), it.get("endTime"), it.get("location") or "-",
            it.get("teacher") or "-", it.get("weeksExpr") or "-",
            it.get("confidence") if isinstance(it.get("confidence"), (int, float)) else 0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
