import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * AI 调用基线采集专用配置（`npm run ai-baseline`）。
 *
 * 刻意与 `vite.config.ts` 分开：
 * - 这里只匹配 `baseline/**\/*.run.ts`，不会命中 `src/**\/*.test.ts`，
 *   所以 `npm test` / CI 的门禁范围不受影响；
 * - 需要 jsdom（renderHook 驱动真实 hook）与超长超时（每次都是真实网络请求）。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['baseline/**/*.run.ts'],
    // 采集任务：串行执行，避免并发请求互相干扰与触发服务商限流
    fileParallelism: false,
    sequence: { concurrent: false },
    retry: 0,
    testTimeout: 15 * 60 * 1000,
    hookTimeout: 60 * 1000,
    // 默认 reporter 会折叠通过用例的 console 输出；采集场景需要看到逐轮进度与结尾摘要
    reporters: ['verbose'],
  },
});
