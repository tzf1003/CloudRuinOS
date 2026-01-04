@echo off
echo 正在运行优化后的测试...
echo.

cd console

echo 运行属性测试（优化后）...
npm test -- --run --reporter=verbose src/test/*.property.test.tsx

echo.
echo 测试完成！
echo 如果测试运行速度明显提升，说明优化成功。
pause