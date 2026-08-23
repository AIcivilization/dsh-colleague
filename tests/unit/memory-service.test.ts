/**
 * MemoryService unit tests
 *
 * Test coverage:
 * - recordEvent / recordDecision / recordCommand / recordQuality
 * - searchByTask (search by task id)
 * - search (full-text search)
 * - injection limits (maxEntries / maxCharsPerEntry / maxTotalChars)
 * - persistence (write/load)
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
      memory = new MemoryService(); // no persistence by default
  });

  describe('record operations', () => {
    it('recordEvent records an event', () => {
      memory.recordEvent({
        content: 'taskopen initial executes',
        metadata: { taskId: 'task-001' },
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].content).toBe('taskopen initial executes');
      expect(all[0].metadata.source).toBe('event');
      expect(all[0].metadata.taskId).toBe('task-001');
    });

    it('recordDecision records an architecture decision', () => {
      memory.recordDecision({
        content: 'Choose React as the frontend framework',
        metadata: {},
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].metadata.source).toBe('decision');
    });

    it('recordCommand records a verified command', () => {
      memory.recordCommand({
        content: 'npm run build',
        metadata: {},
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].metadata.source).toBe('command');
    });

    it('recordQuality records a quality conclusion', () => {
      memory.recordQuality({
        content: 'Review passed, no major issues',
        metadata: { taskId: 'task-001' },
      });
      const all = memory.getAll();
      expect(all.length).toBe(1);
      expect(all[0].metadata.source).toBe('quality');
    });

    it('multiple records add to list', () => {
      memory.recordEvent({ content: 'event1', metadata: {} });
      memory.recordEvent({ content: 'event2', metadata: {} });
      memory.recordDecision({ content: 'decision1', metadata: {} });
      expect(memory.getAll().length).toBe(3);
    });
  });

  describe('searchByTask', () => {
    beforeEach(() => {
      memory.recordEvent({ content: 'taskA started', metadata: { taskId: 'task-A' } });
      memory.recordEvent({ content: 'taskA done', metadata: { taskId: 'task-A' } });
      memory.recordEvent({ content: 'taskB started', metadata: { taskId: 'task-B' } });
      memory.recordQuality({ content: 'taskA review passed', metadata: { taskId: 'task-A' } });
    });

    it('by taskId returns matching records', () => {
      const result = memory.searchByTask('task-A');
      expect(result.total).toBe(3);
      expect(result.entries.length).toBe(3);
      expect(result.truncated).toBe(false);
    });

    it('non-existent taskId returns empty', () => {
      const result = memory.searchByTask('nonexistent');
      expect(result.total).toBe(0);
      expect(result.entries.length).toBe(0);
    });

    it('only returns entries for the given taskId', () => {
      const result = memory.searchByTask('task-B');
      expect(result.total).toBe(1);
      expect(result.entries[0].content).toBe('taskB started');
    });
  });

  describe('search (full-text search)', () => {
    beforeEach(() => {
      memory.recordEvent({ content: 'User login success implementation', metadata: {} });
      memory.recordDecision({ content: 'Use JWT for verification', metadata: {} });
      memory.recordEvent({ content: 'Login test passed', metadata: {} });
    });

    it('close match query', () => {
      const result = memory.search('login');
      expect(result.total).toBe(2);
    });

    it('case-insensitive search works', () => {
      memory.recordEvent({ content: 'React Framework', metadata: {} });
      const result = memory.search('react');
      expect(result.total).toBe(1);
    });

    it('no match returns empty', () => {
      const result = memory.search('nonexistent');
      expect(result.total).toBe(0);
    });
  });

  describe('injection limits', () => {
    it('maxEntries limits returned items', () => {
      // record 10 items
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
      // maxEntries limits returned items to 3
      expect(result.entries.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('maxCharsPerEntry truncates long entries', () => {
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

    it('maxTotalChars limits total injection characters', () => {
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

    it('records are persisted to memory.jsonl', () => {
      persistedMemory.recordEvent({
        content: 'Test persistence',
        metadata: { taskId: 'task-001' },
      });
      const memPath = join(persistDir, 'memory.jsonl');
      expect(existsSync(memPath)).toBe(true);
      const content = readFileSync(memPath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim());
      expect(lines.length).toBe(1);
      const entry = JSON.parse(lines[0]);
      expect(entry.content).toBe('Test persistence');
    });

    it('restart loads persisted memory from file', () => {
      persistedMemory.recordEvent({
        content: 'Need to recover memory',
        metadata: { taskId: 'task-001' },
      });
      persistedMemory.recordDecision({
        content: 'Architecture decision',
        metadata: {},
      });

      // create new instance to load from same file
      const restored = new MemoryService(persistDir);
      const all = restored.getAll();
      expect(all.length).toBe(2);
      expect(all[0].content).toBe('Need to recover memory');
      expect(all[1].content).toBe('Architecture decision');
    });

    it('clear empties memory and persists', () => {
      persistedMemory.recordEvent({ content: 'memory1', metadata: {} });
      persistedMemory.recordEvent({ content: 'memory2', metadata: {} });
      expect(persistedMemory.getAll().length).toBe(2);

      persistedMemory.clear();
      expect(persistedMemory.getAll().length).toBe(0);

      // file should also be empty
      const restored = new MemoryService(persistDir);
      expect(restored.getAll().length).toBe(0);
    });
  });

  describe('access tracking', () => {
    it('searchByTask updates lastAccessed and accessCount', () => {
      memory.recordEvent({
        content: 'Test record',
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
