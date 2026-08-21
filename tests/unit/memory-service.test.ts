/**
 * MemoryService 单元测试
 *
 * 测试覆盖：
 * - recordEvent / recordDecision / recordCommand / recordQuality
 * - searchByTask（按任务检索）
 * - search（全文检索）
 * - 注入上限（maxEntries / maxCharsPerEntry / maxTotalChars）
 * - 持久化（写入/加载）
 * - clear
 * - getAll
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryService } from '../../memory/store';
import { DEFAULT_INJECTION_CONFIG } from '../../memory/types';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('MemoryService', () => {
  let memory: MemoryService;

  beforeEach(() => {
    memory = new MemoryService(); // 不启用持久化
  });

  describe('记录操作', () => {
    it('recordEvent 记录事件', () => {
      memory.recordEvent({
        content: '任务开始执行',
        metadata: { taskId: 'task-001' },
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].content).toBe('任务开始执行');
      expect(all[0].metadata.source).toBe('event');
      expect(all[0].metadata.taskId).toBe('task-001');
    });

    it('recordDecision 记录架构决定', () => {
      memory.recordDecision({
        content: '选择 React 作为前端框架',
        metadata: {},
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].metadata.source).toBe('decision');
    });

    it('recordCommand 记录已验证命令', () => {
      memory.recordCommand({
        content: 'npm run build',
        metadata: {},
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].metadata.source).toBe('command');
    });

    it('recordQuality 记录质量结论', () => {
      memory.recordQuality({
        content: '审核通过，无严重问题',
        metadata: { taskId: 'task-001' },
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].metadata.source).toBe('quality');
    });

    it('多条记录追加到列表', () => {
      memory.recordEvent({ content: '事件1', metadata: {} });
      memory.recordEvent({ content: '事件2', metadata: {} });
      memory.recordDecision({ content: '决定1', metadata: {} });
      expect(memory.getAll().length).toBe(3);
    });
  });

  describe('searchByTask', () => {
    beforeEach(() => {
      memory.recordEvent({ content: '任务A开始', metadata: { taskId: 'task-A' } });
      memory.recordEvent({ content: '任务A完成', metadata: { taskId: 'task-A' } });
      memory.recordEvent({ content: '任务B开始', metadata: { taskId: 'task-B' } });
      memory.recordQuality({ content: '任务A审核通过', metadata: { taskId: 'task-A' } });
    });

    it('按 taskId 检索相关记忆', () => {
      const result = memory.searchByTask('task-A');
      expect(result.total).toBe(3);
      expect(result.entries.length).toBe(3);
      expect(result.truncated).toBe(false);
    });

    it('不存在的 taskId 返回空', () => {
      const result = memory.searchByTask('nonexistent');
      expect(result.total).toBe(0);
      expect(result.entries.length).toBe(0);
    });

    it('只返回指定 taskId 的记忆', () => {
      const result = memory.searchByTask('task-B');
      expect(result.total).toBe(1);
      expect(result.entries[0].content).toBe('任务B开始');
    });
  });

  describe('search（全文检索）', () => {
    beforeEach(() => {
      memory.recordEvent({ content: '用户登录功能实现', metadata: {} });
      memory.recordDecision({ content: '使用 JWT 认证', metadata: {} });
      memory.recordEvent({ content: '登录测试通过', metadata: {} });
    });

    it('关键词匹配', () => {
      const result = memory.search('登录');
      expect(result.total).toBe(2);
    });

    it('大小写不敏感', () => {
      memory.recordEvent({ content: 'React Framework', metadata: {} });
      const result = memory.search('react');
      expect(result.total).toBe(1);
    });

    it('无匹配返回空', () => {
      const result = memory.search('nonexistent');
      expect(result.total).toBe(0);
    });
  });

  describe('注入上限', () => {
    it('maxEntries 限制返回条目数', () => {
      // 记录 10 条
      for (let i = 0; i < 10; i++) {
        memory.recordEvent({
          content: `事件${i}`,
          metadata: { taskId: 'task-x' },
        });
      }
      const result = memory.searchByTask('task-x', {
        ...DEFAULT_INJECTION_CONFIG,
        maxEntries: 3,
      });
      // maxEntries 限制后返回 3 条，total 也为 3（已切片）
      expect(result.entries.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('maxCharsPerEntry 截断单条内容', () => {
      memory.recordEvent({
        content: 'A'.repeat(1000),
        metadata: { taskId: 'task-x' },
      });
      const result = memory.searchByTask('task-x', {
        ...DEFAULT_INJECTION_CONFIG,
        maxCharsPerEntry: 100,
      });
      expect(result.entries[0].content.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(result.entries[0].content).toContain('...');
    });

    it('maxTotalChars 限制总注入字符', () => {
      for (let i = 0; i < 5; i++) {
        memory.recordEvent({
          content: 'A'.repeat(500),
          metadata: { taskId: 'task-x' },
        });
      }
      const result = memory.searchByTask('task-x', {
        ...DEFAULT_INJECTION_CONFIG,
        maxEntries: 10,
        maxCharsPerEntry: 1000,
        maxTotalChars: 800,
      });
      expect(result.truncated).toBe(true);
      const totalChars = result.entries.reduce((sum, e) => sum + e.content.length, 0);
      expect(totalChars).toBeLessThanOrEqual(800);
    });
  });

  describe('持久化', () => {
    let persistDir: string;
    let persistedMemory: MemoryService;

    beforeEach(() => {
      persistDir = mkdtempSync(join(tmpdir(), 'mem-test-'));
      persistedMemory = new MemoryService(persistDir);
    });

    afterEach(() => {
      rmSync(persistDir, { recursive: true, force: true });
    });

    it('记录后写入 memory.jsonl 文件', () => {
      persistedMemory.recordEvent({
        content: '测试持久化',
        metadata: { taskId: 'task-001' },
      });
      const memPath = join(persistDir, 'memory.jsonl');
      expect(existsSync(memPath)).toBe(true);
      const content = readFileSync(memPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      expect(lines.length).toBe(1);
      const entry = JSON.parse(lines[0]);
      expect(entry.content).toBe('测试持久化');
    });

    it('重启后从文件加载记忆', () => {
      persistedMemory.recordEvent({
        content: '需要恢复的记忆',
        metadata: { taskId: 'task-001' },
      });
      persistedMemory.recordDecision({
        content: '架构决定',
        metadata: {},
      });

      // 创建新实例从同一目录加载
      const restored = new MemoryService(persistDir);
      const all = restored.getAll();
      expect(all.length).toBe(2);
      expect(all[0].content).toBe('需要恢复的记忆');
      expect(all[1].content).toBe('架构决定');
    });

    it('clear 清空记忆并更新文件', () => {
      persistedMemory.recordEvent({ content: '记忆1', metadata: {} });
      persistedMemory.recordEvent({ content: '记忆2', metadata: {} });
      expect(persistedMemory.getAll().length).toBe(2);

      persistedMemory.clear();
      expect(persistedMemory.getAll().length).toBe(0);

      // 文件也应为空
      const restored = new MemoryService(persistDir);
      expect(restored.getAll().length).toBe(0);
    });
  });

  describe('访问记录更新', () => {
    it('searchByTask 更新 lastAccessed 和 accessCount', () => {
      memory.recordEvent({
        content: '测试访问记录',
        metadata: { taskId: 'task-001' },
      });

      const before = memory.getAll()[0];
      const beforeAccessCount = before.metadata.accessCount ?? 0;

      memory.searchByTask('task-001');

      const after = memory.getAll()[0];
      expect(after.metadata.accessCount).toBe(beforeAccessCount + 1);
      expect(after.metadata.lastAccessed).toBeGreaterThanOrEqual(
        before.metadata.lastAccessed ?? 0,
      );
    });
  });
});
