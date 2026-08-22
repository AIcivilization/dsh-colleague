/**
 * MemoryService single unitTest
 *
 * Testcover cover：
 * - recordEvent / recordDecision / recordCommand / recordQuality
 * - searchByTask（presstaskcheck search）
 * - search（all text check search）
 * - register input up limit（maxEntries / maxCharsPerEntry / maxTotalChars）
 * - persistence（write/load）
 * - clean
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
    memory = new MemoryService(); // notstart usepersistence
  });

  describe('record recordoperation', () => {
    it('recordEvent record recordevent', () => {
      memory.recordEvent({
        content: 'taskopen initial execute row',
        metadata: { taskId: 'task-001' },
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].content).toBe('taskopen initial execute row');
      expect(all[0].metadata.source).toBe('event');
      expect(all[0].metadata.taskId).toBe('task-001');
    });

    it('recordDecision record record architect structure decis bind', () => {
      memory.recordDecision({
        content: 'select select React workforbeforeend  architect',
        metadata: {},
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].metadata.source).toBe('decision');
    });

    it('recordCommand record recordhasverify verify life command', () => {
      memory.recordCommand({
        content: 'npm run build',
        metadata: {},
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].metadata.source).toBe('command');
    });

    it('recordQuality record record quality amount conclusion conclusion', () => {
      memory.recordQuality({
        content: 'Review passed，no strict heavyIssue',
        metadata: { taskId: 'task-001' },
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].metadata.source).toBe('quality');
    });

    it('many item record record  addtolist', () => {
      memory.recordEvent({ content: 'event1', metadata: {} });
      memory.recordEvent({ content: 'event2', metadata: {} });
      memory.recordDecision({ content: 'decis bind1', metadata: {} });
      expect(memory.getAll().length).toBe(3);
    });
  });

  describe('searchByTask', () => {
    beforeEach(() => {
      memory.recordEvent({ content: 'taskAopen initial', metadata: { taskId: 'task-A' } });
      memory.recordEvent({ content: 'taskADone', metadata: { taskId: 'task-A' } });
      memory.recordEvent({ content: 'taskBopen initial', metadata: { taskId: 'task-B' } });
      memory.recordQuality({ content: 'taskAReview passed', metadata: { taskId: 'task-A' } });
    });

    it('press taskId check search phase close record memory', () => {
      const result = memory.searchByTask('task-A');
      expect(result.total).toBe(3);
      expect(result.entries.length).toBe(3);
      expect(result.truncated).toBe(false);
    });

    it('does not existof taskId return returnempty', () => {
      const result = memory.searchByTask('nonexistent');
      expect(result.total).toBe(0);
      expect(result.entries.length).toBe(0);
    });

    it('only return return point bind taskId ofrecord memory', () => {
      const result = memory.searchByTask('task-B');
      expect(result.total).toBe(1);
      expect(result.entries[0].content).toBe('taskBopen initial');
    });
  });

  describe('search（all text check search）', () => {
    beforeEach(() => {
      memory.recordEvent({ content: 'use userloginsuccesscanimplement', metadata: {} });
      memory.recordDecision({ content: 'use use JWT verify verify', metadata: {} });
      memory.recordEvent({ content: 'loginTestPassed', metadata: {} });
    });

    it('close   match config', () => {
      const result = memory.search('login');
      expect(result.total).toBe(2);
    });

    it('large small writenot ', () => {
      memory.recordEvent({ content: 'React Framework', metadata: {} });
      const result = memory.search('react');
      expect(result.total).toBe(1);
    });

    it('no match config return returnempty', () => {
      const result = memory.search('nonexistent');
      expect(result.total).toBe(0);
    });
  });

  describe('register input up limit', () => {
    it('maxEntries limit control return return item item data', () => {
      // record record 10 item
      for (let i = 0; i < 10; i++) {
        memory.recordEvent({
          content: `event${i}`,
          metadata: { taskId: 'task-x' },
        });
      }
      const result = memory.searchByTask('task-x', {
        ...DEFAULT_INJECTION_CONFIG,
        maxEntries: 3,
      });
      // maxEntries limit controlafterreturn return 3 item，total alsofor 3（hasswitch piece）
      expect(result.entries.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('maxCharsPerEntry  break single item inner content', () => {
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

    it('maxTotalChars limit control total register input character symbol', () => {
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

  describe('persistence', () => {
    let persistDir: string;
    let persistedMemory: MemoryService;

    beforeEach(() => {
      persistDir = mkdtempSync(join(tmpdir(), 'mem-test-'));
      persistedMemory = new MemoryService(persistDir);
    });

    afterEach(() => {
      rmSync(persistDir, { recursive: true, force: true });
    });

    it('record recordafterwrite memory.jsonl text component', () => {
      persistedMemory.recordEvent({
        content: 'Testpersistence',
        metadata: { taskId: 'task-001' },
      });
      const memPath = join(persistDir, 'memory.jsonl');
      expect(existsSync(memPath)).toBe(true);
      const content = readFileSync(memPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      expect(lines.length).toBe(1);
      const entry = JSON.parse(lines[0]);
      expect(entry.content).toBe('Testpersistence');
    });

    it('restartafterfromtext componentloadrecord memory', () => {
      persistedMemory.recordEvent({
        content: 'Needrecoveryofrecord memory',
        metadata: { taskId: 'task-001' },
      });
      persistedMemory.recordDecision({
        content: 'architect structure decis bind',
        metadata: {},
      });

      // createnew actual instancefromsame one item recordload
      const restored = new MemoryService(persistDir);
      const all = restored.getAll();
      expect(all.length).toBe(2);
      expect(all[0].content).toBe('Needrecoveryofrecord memory');
      expect(all[1].content).toBe('architect structure decis bind');
    });

    it('clean cleanemptyrecord memory and update new text component', () => {
      persistedMemory.recordEvent({ content: 'record memory1', metadata: {} });
      persistedMemory.recordEvent({ content: 'record memory2', metadata: {} });
      expect(persistedMemory.getAll().length).toBe(2);

      persistedMemory.clear();
      expect(persistedMemory.getAll().length).toBe(0);

      // text component alsoshouldforempty
      const restored = new MemoryService(persistDir);
      expect(restored.getAll().length).toBe(0);
    });
  });

  describe('  record record update new', () => {
    it('searchByTask update new lastAccessed and accessCount', () => {
      memory.recordEvent({
        content: 'Test  record record',
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
