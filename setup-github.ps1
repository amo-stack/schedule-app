# 课程表 App -> GitHub 一键上传脚本
# 用法：双击 一键上传GitHub.bat，粘贴 token 回车即可

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host ""
Write-Host "===== 课程表 App 上传到 GitHub =====" -ForegroundColor Cyan
Write-Host ""

$token = (Read-Host "请粘贴 GitHub Token (ghp_ 开头)").Trim()
if ($token -eq "") {
    Write-Host "没有输入 token，已取消。" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    Authorization = "token $token"
    "User-Agent"  = "schedule-app"
}

# 1. 读取账号
try {
    $user = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/user"
} catch {
    Write-Host "登录失败：token 无效或网络不通。" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}
$login = $user.login
Write-Host "账号：$login" -ForegroundColor Green

# 2. 建仓库（已存在就跳过）
$body = @{
    name        = "schedule-app"
    description = "课程表识别与上课提醒 App"
    private     = $false
    auto_init   = $false
} | ConvertTo-Json

try {
    Invoke-RestMethod -Method Post -Headers $headers -Uri "https://api.github.com/user/repos" `
        -Body $body -ContentType "application/json" | Out-Null
    Write-Host "仓库已创建：schedule-app" -ForegroundColor Green
} catch {
    Write-Host "仓库已存在，直接使用。" -ForegroundColor Yellow
}

# 3. 推送代码
Write-Host "正在推送代码..." -ForegroundColor Cyan
git remote remove origin 2>$null | Out-Null
git remote add origin "https://$token@github.com/$login/schedule-app.git"
git branch -M main 2>$null | Out-Null
git push -u origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "推送失败。" -ForegroundColor Red
    exit 1
}

# 4. 清掉地址里残留的 token
git remote set-url origin "https://github.com/$login/schedule-app.git"
Write-Host "推送成功！" -ForegroundColor Green
Write-Host ""
Write-Host "================ 接下来 ================" -ForegroundColor Cyan
Write-Host "编译进度（约 5-8 分钟）:"
Write-Host "  https://github.com/$login/schedule-app/actions" -ForegroundColor White
Write-Host ""
Write-Host "APK 下载链接（编译完成后才有效）:"
Write-Host "  https://github.com/$login/schedule-app/releases/download/latest/app-debug.apk" -ForegroundColor White
Write-Host ""
Write-Host "建议：用完后去 https://github.com/settings/tokens 把这个 token 删掉。" -ForegroundColor Yellow
Write-Host ""
