// Standalone pretend ReachLMS on its own port (used by `npm test` and `npm run mock-canvas`).
// For the single-address demo, use DEMO_MODE=true instead (see README).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createMockPlatform } from '../src/demo/mock-platform.js';

export async function startMockCanvas({ port = 4000, toolUrl = 'http://localhost:3000' } = {}) {
  const m = await createMockPlatform({ base: `http://localhost:${port}`, toolUrl });
  const server = await new Promise((resolve) => { const s = m.app.listen(port, () => resolve(s)); });
  return { ...m, server, close: () => new Promise((r) => server.close(r)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const toolUrl = process.env.TOOL_URL || 'http://localhost:3000';
  const m = await startMockCanvas({ port: Number(process.env.MOCK_PORT || 4000), toolUrl });
  console.log(`Mock ReachLMS running at ${m.base} (tool: ${toolUrl}). Start the tool with ALLOW_INSECURE_PLATFORMS=true.`);
}
