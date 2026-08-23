/**
 * Real DSH Cordis plugin load test
 *
 * Uses a real @deepseek-ai/cordis Context to load dsh-colleague,
 * verifying that apply() executes correctly in a real runtime.
 * The orchestration loop uses a mock SubagentRuntime (does not depend on a real LLM).
 */

import { Context, Fiber } from '@deepseek-ai/cordis';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const plugin = require(resolve(process.cwd(), 'dist/index.js'));

// ===== Mock SubagentRuntime =====

function createMockSubagentRuntime() {
  let leaderCallCount = 0;

  return {
    async start(name, request) {
      const promptText = request.prompt.map(b => b.text || '').join('');
      let output = '';

      if (promptText.includes('your decision') || promptText.includes('team goal')) {
        // Leader decision
        leaderCallCount++;
        if (leaderCallCount === 1) {
          output = JSON.stringify({
            type: 'create_task',
            task: {
              title: 'Implement login page',
              description: 'Create a login form component',
              role: 'coder',
              dependencies: [],
            },
            reason: 'Need to implement login page first',
          });
        } else {
          output = JSON.stringify({
            type: 'report',
            summary: 'Login page implementation done',
            reason: 'All tasks are done',
          });
        }
      } else {
        // Coder executes
        output = JSON.stringify({
          status: 'completed',
          summary: 'Login page implementation done',
          artifacts: ['Login.tsx'],
          issues: [],
        });
      }

      return {
        result: Promise.resolve({
          output: [{ type: 'text', text: output }],
          stopReason: 'completed',
        }),
        dispose: async () => {},
      };
    },
  };
}

// ===== Test =====

async function main() {
  console.log('=== Real DSH Cordis plugin load test ===\n');

  // 1. Create a real Cordis Context
  const ctx = new Context();
  console.log('[1] Cordis Context created successfully');

  // 2. Create a temporary workspace
  const workspace = mkdtempSync(resolve(tmpdir(), 'colleague-e2e-'));
  console.log('[2] Temporary workspace:', workspace);

  try {
    // 3. Load the plugin
    console.log('[3] Loading plugin apply()...');
    plugin.apply(ctx, {
      configPath: 'config/team.yaml',
      workspace,
      memoryEnabled: false,
    });
    console.log('[3] apply() success\n');

    // 4. Verify services are registered
    const teamService = ctx['colleague-team'];
    const loopService = ctx['colleague-loop'];
    console.log('[4] Service verification:');
    console.log('    colleague-team:', teamService ? typeof teamService : 'MISSING');
    console.log('    colleague-loop:', loopService ? typeof loopService : 'MISSING');

    if (!teamService || !loopService) {
      console.error('\n❌ Services not registered!');
      process.exit(1);
    }
    console.log('[4] Services registered\n');

    // 5. Verify TeamRuntime status
    const snapshot = teamService.getSnapshot();
    console.log('[5] TeamRuntime snapshot:');
    console.log('    teamId:', snapshot.id);
    console.log('    teamName:', snapshot.name);
    console.log('    status:', snapshot.status);
    console.log('    members:', snapshot.members.length, 'members');
    console.log('    tasks:', snapshot.tasks.length, 'tasks');
    console.log('[5] Status correct\n');

    // 6. Bind mock SubagentRuntime and start orchestrationion loop
    console.log('[6] Binding SubagentRuntime...');
    loopService.bindSubagentRuntime(createMockSubagentRuntime());
    console.log('[6] Binding success\n');

    // 7. Start orchestrationion loop
    console.log('[7] Starting orchestrationion loop...');
    console.log('    goal: Implement a login page\n');
    await loopService.start('Implement a login page');

    const finalSnapshot = teamService.getSnapshot();
    console.log('[7] Loop finished:');
    console.log('    loop state:', loopService.getState());
    console.log('    team status:', finalSnapshot.status);
    console.log('    tasks:', finalSnapshot.tasks.length);
    if (finalSnapshot.tasks.length > 0) {
      console.log('    task[0]:', finalSnapshot.tasks[0].title, '→', finalSnapshot.tasks[0].status);
    }
    console.log('');

    if (loopService.getState() === 'completed' && finalSnapshot.status === 'completed') {
      console.log('=== ✅ All passed ===');
    } else {
      console.log('=== ❌ Loop did not reach completed status ===');
      console.log('    loop:', loopService.getState(), 'team:', finalSnapshot.status);
      loopService.dispose();
      teamService.dispose();
      rmSync(workspace, { recursive: true, force: true });
      process.exit(1);
    }

    // 8. Cleanup
    loopService.dispose();
    teamService.dispose();

  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
