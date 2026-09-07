# 课程表 App（Capacitor 版）

拍照/截图识别课表 → 周课表视图 → 上课前自动提醒。**不使用 Expo**，APK 由 GitHub Actions 云编译。

## 为什么是这套

| 项 | 说明 |
|---|---|
| 界面技术 | 纯 HTML/CSS/JS，双击 `www/index.html` 就能在浏览器里真点真用 |
| 打包 | Capacitor 壳 + GitHub Actions 云编译，本机不需要装 Android Studio |
| 账号 | 只需要 GitHub 账号，不需要 Expo 账号 |
| 核心算法 | 周次解析、提醒调度都在 `www/js/` 下，与界面解耦，可单独复用 |

## 目录结构

```
www/
  index.html        单页应用骨架（4 个视图）
  css/app.css       样式
  js/weeks.js       周次表达式解析：1-16周(双) → [2,4,6...]
  js/term.js        学期周次与日期换算
  js/store.js       localStorage 数据层（课程/设置/学期）
  js/scheduler.js   提醒调度（Capacitor LocalNotifications）
  js/vision.js      云端视觉识别 + 图片压缩 + 选图
  js/app.js         页面渲染与交互
capacitor.config.json
.github/workflows/android.yml   云编译 APK
```

## 本地预览

直接双击 `www/index.html`（或拖进浏览器）。此时为网页预览模式：
- 界面、课表、编辑、周次解析全部可用
- 相机/相册走浏览器文件选择
- 提醒只计算不实际推送（需打包成 App 后生效）

## 打包成 APK

1. 在 GitHub 新建空仓库（不要勾选 README）
2. 在项目目录执行：

```bash
git init
git add .
git commit -m "课程表 App"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

3. 推送后 GitHub Actions 自动开始编译，约 5-10 分钟
4. 进入仓库的 Actions 页面 → 最新一次运行 → 底部 Artifacts 下载 `schedule-app-debug`
5. 解压得到 `app-debug.apk`，传到手机安装即可

首次安装会提示「未知来源应用」，允许即可。

## 配置识别 API（可选）

不配置也能用，手动添加课程即可。配置后识别准确率显著提升：

- 打开 App → 设置 → 课表识别 → 选「智谱」→ 填入 API Key → 保存
- 智谱 GLM-4V-Flash 免费：https://open.bigmodel.cn
- 阿里百炼 Qwen2.5-VL：https://dashscope.aliyun.com

## 提醒实现要点

不使用「每周重复」触发器（无法表达单双周与起止周），改为把每门课按学期展开成具体日期，逐条注册一次性精确通知。10 门课 × 16 周约 160 条，Android AlarmManager 上限 500 条，安全。

## 注意事项

- 国产 ROM（小米/华为/OPPO）需在系统设置里允许自启动、锁屏显示、电池无限制，否则提醒可能被系统拦截
- debug 版 APK 未签名即可安装，够自用；若要上架需正式签名
