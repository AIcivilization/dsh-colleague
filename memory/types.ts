/**
 * Memory system type definitions
 *
 * First version implements persistent team events, architectural decisions, verified commands, and quality conclusions.
 * Retrieves a small amount of relevant content per task for injection into Leader or execution roles.
 * L0–L3 distillation deferred to future versions.
 */

// ===== Memory entry =====

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

// ===== Memory search result =====

export interface MemorySearchResult {
  entries: MemoryEntry[];
  total: number;
  truncated: boolean;
}

// ===== Memory injection config =====

export interface MemoryInjectionConfig {
  /** Max entries per injection */
  maxEntries: number;
  /** Max characters per memory entry */
  maxCharsPerEntry: number;
  /** Max total characters for injection */
  maxTotalChars: number;
}

export const DEFAULT_INJECTION_CONFIG: MemoryInjectionConfig = {
  maxEntries: 5,
  maxCharsPerEntry: 500,
  maxTotalChars: 2000,
};

// ===== Memory operations interface =====

export interface MemoryOps {
  /** Record team event */
  recordEvent(entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> }): void;

  /** Record architectural decision */
  recordDecision(entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> }): void;

  /** Record verified command */
  recordCommand(entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> }): void;

  /** Record quality conclusion */
  recordQuality(entry: Omit<MemoryEntry, 'id' | 'metadata'> & { metadata?: Partial<MemoryEntry['metadata']> }): void;

  /** Retrieve relevant memory by task */
  searchByTask(taskId: string, config?: MemoryInjectionConfig): MemorySearchResult;

  /** Full-text search */
  search(query: string, config?: MemoryInjectionConfig): MemorySearchResult;

  /** Get all memory entries */
  getAll(): MemoryEntry[];

  /** Clear all memory */
  clear(): void;
}
