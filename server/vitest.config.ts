import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 120000, // 增加全局测试超时时间到2分钟
    hookTimeout: 120000, // 增加 hook 超时时间到2分钟
    teardownTimeout: 30000, // 增加清理超时时间
    maxConcurrency: 1, // 限制并发以避免资源竞争
    retry: 1, // 允许重试一次以处理偶发的网络问题
  },
})