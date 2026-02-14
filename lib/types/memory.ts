/**
 * MEMORY TYPES
 * Type definitions for session-based entity memory system
 */

export interface Entity {
  id: string;
  type: 'customer' | 'product' | 'order' | 'invoice' | 'employee' | 'opportunity';
  name: string;
  odooId?: number;
  metadata: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  mentionedAt: Date;
}

export interface SessionMemory {
  sessionId: string;
  entities: Map<string, Entity>;
  createdAt: Date;
  lastAccessedAt: Date;
}
