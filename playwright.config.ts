import { defineConfig, devices } from '@playwright/test'

// spare ports, so a `pnpm dev` on 8080 (and the vite dev server on 3000) can keep running alongside
const API_PORT = 8090
const WEB_PORT = 4180
const WEB_URL = `http://localhost:${WEB_PORT}`

// browser end-to-end tests: a real browser drives the production build of the frontend, which talks to the real API
// through the same /api proxy rule as production. `pnpm e2e` builds both first
export default defineConfig({
  testDir: 'e2e',
  // the API is one process with in-memory rate limits; a handful of workers keeps it realistic without flooding it
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', {open: 'never'}]] : 'list',
  use: {
    baseURL: WEB_URL,
    // a recording of every step (DOM snapshots, network, console) for a failed test: npx playwright show-trace <file>
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {name: 'chromium', use: {...devices['Desktop Chrome']}},
    {name: 'firefox', use: {...devices['Desktop Firefox']}},
    {name: 'webkit', use: {...devices['Desktop Safari']}},
    // the header shows only one of Sign in / Sign up on phones
    {name: 'phone', use: {...devices['Pixel 7']}},
  ],
  webServer: [
    {
      command: 'node e2e/start-api.ts',
      url: `http://localhost:${API_PORT}/`,
      env: {PORT: String(API_PORT), FRONTEND_URL: WEB_URL},
      reuseExistingServer: false,
      stderr: 'pipe',
    },
    {
      command: `pnpm run preview --port ${WEB_PORT} --strictPort`,
      cwd: 'frontend',
      url: WEB_URL,
      // vite preview reuses server.proxy from vite.config.ts: /api is stripped and sent here
      env: {API_PROXY_TARGET: `http://localhost:${API_PORT}`},
      reuseExistingServer: false,
    },
  ],
})
