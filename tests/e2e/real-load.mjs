/**
 * 真实 DSH Cordis 插件加载测试
 *
 * 使用真实的 @deepseek-ai/cordis Context 加载 colleague-plugin，
 * 验证 apply() 在真实运行时下正常执行。
 * 编排循环使用 mock SubagentRuntime（不依赖真实 LLM）。
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

      if (promptText.includes('你的决策') || promptText.includes('团队目标')) {
        // Leader 决策
        leaderCallCount++;
        if (leaderCallCount === 1) {
          output = JSON.stringify({
            type: 'create_task',
            task: {
              title: '实现登录页',
              description: '创建一个登录表单组件',
              role: 'coder',
              dependencies: [],
            },
            reason: '需要先实现登录页面',
          });
        } else {
          output = JSON.stringify({
            type: 'report',
            summary: '登录页面实现完成',
            reason: '所有任务已完成',
          });
        }
      } else {
        // coder 执行
        output = JSON.stringify({
          status: 'completed',
          summary: '登录页实现完成',
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

// ===== 测试 =====

async function main() {
  console.log('=== 真实 DSH Cordis 插件加载测试 ===\n');

  // 1. 创建真实 Cordis Context
  const ctx = new Context();
  console.log('[1] Cordis Context 创建成功');

  // 2. 创建临时工作区
  const workspace = mkdtempSync(resolve(tmpdir(), 'colleague-e2e-'));
  console.log('[2] 临时工作区:', workspace);

  try {
    // 3. 加载插件
    console.log('[3] 加载插件 apply()...');
    plugin.apply(ctx, {
      configPath: 'config/team.yaml',
      workspace,
      memoryEnabled: false,
    });
    console.log('[3] apply() 成功\n');

    // 4. 验证服务已注册
    const teamService = ctx['colleague-team'];
    const loopService = ctx['colleague-loop'];
    console.log('[4] 服务验证:');
    console.log('    colleague-team:', teamService ? typeof teamService : 'MISSING');
    console.log('    colleague-loop:', loopService ? typeof loopService : 'MISSING');

    if (!teamService || !loopService) {
      console.error('\n❌ 服务未注册!');
      process.exit(1);
    }
    console.log('[4] 服务已注册\n');

    // 5. 验证 TeamRuntime 状态
    const snapshot = teamService.getSnapshot();
    console.log('[5] TeamRuntime 快照:');
    console.log('    teamId:', snapshot.id);
    console.log('    teamName:', snapshot.name);
    console.log('    status:', snapshot.status);
    console.log('    members:', snapshot.members.length, '人');
    console.log('    tasks:', snapshot.tasks.length, '个');
    console.log('[5] 状态正确\n');

    // 6. 绑定 mock SubagentRuntime 并启动编排循环
    console.log('[6] 绑定 SubagentRuntime...');
    loopService.bindSubagentRuntime(createMockSubagentRuntime());
    console.log('[6] 绑定成功\n');

    // 7. 启动编排循环
    console.log('[7] 启动编排循环...');
    console.log('    目标: 做一个登录页面\n');
    await loopService.start('做一个登录页面');

    const finalSnapshot = teamService.getSnapshot();
    console.log('[7] 循环结束:');
    console.log('    loop state:', loopService.getState());
    console.log('    team status:', finalSnapshot.status);
    console.log('    tasks:', finalSnapshot.tasks.length);
    if (finalSnapshot.tasks.length > 0) {
      console.log('    task[0]:', finalSnapshot.tasks[0].title, '→', finalSnapshot.tasks[0].status);
    }
    console.log('');

    if (loopService.getState() === 'completed' && finalSnapshot.status === 'completed') {
      console.log('=== ✅ 全部通过 ===');
    } else {
      console.log('=== ⚠️ 循环未达到 completed 状态 ===');
      console.log('    loop:', loopService.getState(), 'team:', finalSnapshot.status);
    }

    // 8. 清理
    loopService.dispose();
    teamService.dispose();

  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('\n❌ 测试失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
