# -*- coding: utf-8 -*-
"""生成一张仿高校课表 PNG，用于验证视觉识别链路（不参与打包）"""
import os
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = r"C:\Windows\Fonts\simhei.ttf"
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_sample-timetable.png")

W, H = 900, 620
BG = (255, 255, 255)
LINE = (150, 160, 175)
HEAD_BG = (238, 242, 255)
TEXT = (25, 30, 45)

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)


def font(size):
    return ImageFont.truetype(FONT_PATH, size)


f_title = font(26)
f_head = font(19)
f_cell = font(17)
f_small = font(14)

d.text((W // 2, 18), "2026－2027学年度第一学期课程表", font=f_title, fill=TEXT, anchor="ma")

# 布局
x0, y0 = 30, 62
col_w = 118
row_h = 62
rows = 5

d.rectangle([x0, y0, x0 + col_w, y0 + row_h * (rows + 1)], fill=HEAD_BG, outline=LINE, width=2)
for c in range(1, 8):
    d.rectangle([x0 + col_w * c, y0, x0 + col_w * (c + 1), y0 + row_h * (rows + 1)], outline=LINE, width=2)
for r in range(rows + 1):
    d.rectangle([x0, y0 + row_h * r, x0 + col_w * 8, y0 + row_h * (r + 1)], outline=LINE, width=2)

d.text((x0 + col_w / 2, y0 + row_h / 2), "节次", font=f_head, fill=TEXT, anchor="mm")
days = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
for i, t in enumerate(days):
    d.text((x0 + col_w * (i + 1) + col_w / 2, y0 + row_h / 2), t, font=f_head, fill=TEXT, anchor="mm")

sections = [("第1-2节", "08:00"), ("第3-4节", "10:00"), ("第5-6节", "14:00"), ("第7-8节", "16:00"), ("第9-10节", "19:00")]
for i, (s, t) in enumerate(sections):
    cy = y0 + row_h * (i + 1) + row_h / 2
    d.text((x0 + col_w / 2, cy - 12), s, font=f_cell, fill=TEXT, anchor="mm")
    d.text((x0 + col_w / 2, cy + 12), t, font=f_small, fill=(90, 100, 120), anchor="mm")

# 课程：(列1-7, 行1-5, 名称, 地点, 教师, 周次)
courses = [
    (1, 1, "高等数学A", "教学楼A301", "张伟", "1-16周"),
    (1, 2, "大学英语", "外语楼205", "李娜", "1-16周"),
    (2, 1, "线性代数", "教学楼B102", "王强", "1-16周(双)"),
    (2, 3, "数据结构", "计算机楼401", "刘洋", "1-16周"),
    (3, 2, "概率论", "教学楼A305", "陈静", "1-8,10-16周"),
    (4, 1, "马克思主义原理", "文科楼101", "赵敏", "1-16周(单)"),
    (5, 4, "体育（篮球）", "体育馆", "孙涛", "1-16周"),
]

for col, row, name, loc, tea, wk in courses:
    cx = x0 + col_w * col + col_w / 2
    cy = y0 + row_h * row + row_h / 2
    d.text((cx, cy - 18), name, font=f_cell, fill=TEXT, anchor="mm")
    d.text((cx, cy + 2), loc, font=f_small, fill=(70, 80, 100), anchor="mm")
    d.text((cx, cy + 20), f"{tea}  {wk}", font=f_small, fill=(110, 120, 140), anchor="mm")

img.save(OUT, "PNG")
print("saved:", OUT, img.size)
