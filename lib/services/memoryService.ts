/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * MEMORY SERVICE
 * Session-based entity memory with automatic cleanup
 */

import { Entity, SessionMemory } from '@/lib/types/memory';

// In-memory storage (session-based, 30min TTL)
const sessions = new Map<string, SessionMemory>();

export class MemoryService {
  /**
   * Clean up stale sessions (older than 30 minutes)
   */
  private static cleanup() {
    const now = new Date();
    for (const [sessionId, memory] of sessions.entries()) {
      const age = now.getTime() - memory.lastAccessedAt.getTime();
      if (age > 30 * 60 * 1000) { // 30 minutes
        console.log(`🧹 [MEMORY] Cleaning up stale session: ${sessionId}`);
        sessions.delete(sessionId);
      }
    }
  }

  /**
   * Get or create session memory
   */
  static getSession(sessionId: string): SessionMemory {
    this.cleanup();

    if (!sessions.has(sessionId)) {
      console.log(`🆕 [MEMORY] Creating new session: ${sessionId}`);
      sessions.set(sessionId, {
        sessionId,
        entities: new Map(),
        createdAt: new Date(),
        lastAccessedAt: new Date()
      });
    }

    const session = sessions.get(sessionId)!;
    session.lastAccessedAt = new Date();
    return session;
  }

  /**
   * Add entity to session memory
   */
  static addEntity(sessionId: string, entity: Entity) {
    const session = this.getSession(sessionId);
    session.entities.set(entity.id, entity);
    console.log(`💾 [MEMORY] Stored ${entity.type}: ${entity.name} (session: ${sessionId})`);
  }

  /**
   * Get entities from session, optionally filtered by type
   */
  static getEntities(sessionId: string, type?: Entity['type']): Entity[] {
    const session = this.getSession(sessionId);
    const entities = Array.from(session.entities.values());
    return type ? entities.filter(e => e.type === type) : entities;
  }

  /**
   * Build context prompt from recent entities
   */
  static buildContextPrompt(sessionId: string): string {
    const session = this.getSession(sessionId);
    if (session.entities.size === 0) return '';

    // Get most recent 10 entities
    const recentEntities = Array.from(session.entities.values())
      .sort((a, b) => b.mentionedAt.getTime() - a.mentionedAt.getTime())
      .slice(0, 10);

    // Group by type
    const grouped = recentEntities.reduce((acc, entity) => {
      if (!acc[entity.type]) acc[entity.type] = [];
      acc[entity.type].push(entity);
      return acc;
    }, {} as Record<string, Entity[]>);

    // Build context string
    let prompt = '\n\n--- CONVERSATION CONTEXT ---\n';
    prompt += 'Recently mentioned entities:\n';
    for (const [type, entities] of Object.entries(grouped)) {
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1) + 's';
      prompt += `• ${typeLabel}: ${entities.map(e => e.name).join(', ')}\n`;
    }
    prompt += '--- END CONTEXT ---\n';

    return prompt;
  }

  /**
   * Clear all entities from a session
   */
  static clearSession(sessionId: string) {
    if (sessions.has(sessionId)) {
      sessions.delete(sessionId);
      console.log(`🗑️ [MEMORY] Cleared session: ${sessionId}`);
    }
  }

  /**
   * Get session statistics (for debugging)
   */
  static getStats() {
    return {
      totalSessions: sessions.size,
      sessions: Array.from(sessions.entries()).map(([id, mem]) => ({
        sessionId: id,
        entityCount: mem.entities.size,
        createdAt: mem.createdAt,
        lastAccessedAt: mem.lastAccessedAt
      }))
    };
  }
}
