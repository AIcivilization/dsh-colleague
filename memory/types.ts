/**
 * 记忆系统类型定义
 *
 * 首版实现为持久化团队事件、架构决定、已验证命令和质量结论。
 * 按任务检索少量相关内容注入 Leader 或执行角色。
 * L0–L3 蒸馏移入后续版本。
 */

// ===== 记忆条目 =====

export interface MemoryEntry {
  id: string;
  content: string;
  metadata: {
    source: string;
    taskId?: string;
    memberId?: string;
    createdAt: number;
    lastAccessed?: number;
    accessCount?: number;
  };
}

// ===== 记忆检索结果 =====

export interface MemorySearchResult {
  entries: MemoryEntry[];
  total: number;
  truncated: boolean;
}

// ===== 记忆注入配置 =====

export interface MemoryInjectionConfig {
  /** 单次注入的最大条目数 */
  maxEntries: number;
  /** 单条记忆的最大字符数 */
  maxCharsPerEntry: number;
  /** 注入总字符上限 */
  maxTotalChars: number;
}

export const DEFAULT_INJECTION_CONFIG: MemoryInjectionConfig = {
  maxEntries: 5,
  maxCharsPerEntry: 500,
  maxTotalChars: 2000,
};

// ===== 记忆操作接口 =====

export interface MemoryOps {
  /** 记录团队事件 */
  recordEvent(entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> }): void;

  /** 记录架构决定 */
  recordDecision(entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> }): void;

  /** 记录已验证命令 */
  recordCommand(entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> }): void;

  /** 记录质量结论 */
  recordQuality(entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> }): void;

  /** 按任务检索相关记忆 */
  searchByTask(taskId: string, config?: MemoryInjectionConfig): MemorySearchResult;

  /** 全文检索 */
  search(query: string, config?: MemoryInjectionConfig): MemorySearchResult;

  /** 获取所有记忆 */
  getAll(): MemoryEntry[];

  /** 清理 */
  clear(): void;
}
