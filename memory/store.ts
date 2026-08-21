/**
 * 记忆服务实现
 *
 * 首版实现为持久化团队事件、架构决定、已验证命令和质量结论。
 * 按任务检索少量相关内容注入 Leader 或执行角色。
 * 单次任务注入的记忆内容有数量与字符上限，避免无限增长。
 */

import { randomUUID } from 'node:crypto';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  MemoryEntry,
  MemorySearchResult,
  MemoryInjectionConfig,
  MemoryOps,
} from './types';
import { DEFAULT_INJECTION_CONFIG } from './types';

export class MemoryService implements MemoryOps {
  private entries: MemoryEntry[] = [];
  private persistencePath: string | null = null;

  constructor(persistenceDir?: string) {
    if (persistenceDir) {
      this.persistencePath = resolve(persistenceDir, 'memory.jsonl');
      this.load();
    }
  }

  recordEvent(
    entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> },
  ): void {
    this.addEntry(entry, 'event');
  }

  recordDecision(
    entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> },
  ): void {
    this.addEntry(entry, 'decision');
  }

  recordCommand(
    entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> },
  ): void {
    this.addEntry(entry, 'command');
  }

  recordQuality(
    entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> },
  ): void {
    this.addEntry(entry, 'quality');
  }

  private addEntry(
    entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> },
    source: string,
  ): void {
    const full: MemoryEntry = {
      id: randomUUID(),
      content: entry.content,
      metadata: {
        source,
        taskId: entry.metadata?.taskId,
        memberId: entry.metadata?.memberId,
        createdAt: entry.metadata?.createdAt ?? Date.now(),
        lastAccessed: Date.now(),
        accessCount: 0,
      },
    };
    this.entries.push(full);
    this.persist();
  }

  searchByTask(taskId: string, config?: MemoryInjectionConfig): MemorySearchResult {
    const cfg = config || DEFAULT_INJECTION_CONFIG;
    const results = this.entries
      .filter((e) => e.metadata.taskId === taskId)
      .slice(-cfg.maxEntries);

    return this.truncate(results, cfg);
  }

  search(query: string, config?: MemoryInjectionConfig): MemorySearchResult {
    const cfg = config || DEFAULT_INJECTION_CONFIG;
    const lower = query.toLowerCase();
    const results = this.entries
      .filter((e) => e.content.toLowerCase().includes(lower))
      .slice(-cfg.maxEntries);

    return this.truncate(results, cfg);
  }

  getAll(): MemoryEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
    this.persist();
  }

  private truncate(
    results: MemoryEntry[],
    cfg: MemoryInjectionConfig,
  ): MemorySearchResult {
    let totalChars = 0;
    const truncated: MemoryEntry[] = [];
    let wasTruncated = false;

    for (const entry of results) {
      const content =
        entry.content.length > cfg.maxCharsPerEntry
          ? entry.content.slice(0, cfg.maxCharsPerEntry) + '...'
          : entry.content;

      if (totalChars + content.length > cfg.maxTotalChars) {
        wasTruncated = true;
        break;
      }

      truncated.push({ ...entry, content });
      totalChars += content.length;

      // 更新访问记录
      entry.metadata.lastAccessed = Date.now();
      entry.metadata.accessCount = (entry.metadata.accessCount || 0) + 1;
    }

    return {
      entries: truncated,
      total: results.length,
      truncated: wasTruncated,
    };
  }

  private persist(): void {
    if (!this.persistencePath) return;
    try {
      const dir = resolve(this.persistencePath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const lines = this.entries.map((e) => JSON.stringify(e));
      writeFileSync(this.persistencePath, lines.join('\n') + '\n', 'utf-8');
    } catch {
      // 持久化失败不阻断主流程
    }
  }

  private load(): void {
    if (!this.persistencePath) return;
    if (!existsSync(this.persistencePath)) return;
    try {
      const text = readFileSync(this.persistencePath, 'utf-8');
      const lines = text.split('\n').filter((l) => l.trim());
      this.entries = lines.map((l) => JSON.parse(l) as MemoryEntry);
    } catch {
      // 加载失败不阻断启动
    }
  }
}
