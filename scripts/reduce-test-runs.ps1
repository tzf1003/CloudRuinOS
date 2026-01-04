# 批量减少测试文件中的 numRuns 值
# 提高测试运行速度

$testFiles = Get-ChildItem -Path "console/src/test" -Filter "*.property.test.tsx" -Recurse

$replacements = @{
    "numRuns: 100" = "numRuns: 20"
    "numRuns: 50" = "numRuns: 15" 
    "numRuns: 30" = "numRuns: 10"
    "numRuns: 25" = "numRuns: 8"
    "numRuns: 20" = "numRuns: 8"
    "numRuns: 15" = "numRuns: 6"
    "numRuns: 10" = "numRuns: 5"
    "numRuns: 8" = "numRuns: 4"
    "numRuns: 6" = "numRuns: 3"
}

$totalReplacements = 0
$filesModified = 0

foreach ($file in $testFiles) {
    Write-Host "处理文件: $($file.Name)" -ForegroundColor Yellow
    
    $content = Get-Content $file.FullName -Raw
    $originalContent = $content
    $fileReplacements = 0
    
    foreach ($pattern in $replacements.Keys) {
        $newValue = $replacements[$pattern]
        if ($content -match [regex]::Escape($pattern)) {
            $content = $content -replace [regex]::Escape($pattern), $newValue
            $matches = ([regex]::Matches($originalContent, [regex]::Escape($pattern))).Count
            $fileReplacements += $matches
            $totalReplacements += $matches
            Write-Host "  替换 $matches 个 '$pattern' -> '$newValue'" -ForegroundColor Green
        }
    }
    
    if ($fileReplacements -gt 0) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $filesModified++
        Write-Host "  保存了 $fileReplacements 个修改" -ForegroundColor Cyan
    } else {
        Write-Host "  无需修改" -ForegroundColor Gray
    }
}

Write-Host "`n优化完成:" -ForegroundColor Magenta
Write-Host "  修改的文件: $filesModified" -ForegroundColor White
Write-Host "  总计减少: $totalReplacements 个测试示例" -ForegroundColor White

if ($totalReplacements -gt 0) {
    $speedupPercent = [math]::Round(($totalReplacements / ($totalReplacements + 200)) * 100, 1)
    Write-Host "  预计提速: $speedupPercent%" -ForegroundColor Green
    Write-Host "`n建议运行测试验证:" -ForegroundColor Yellow
    Write-Host "  cd console && npm test" -ForegroundColor White
}