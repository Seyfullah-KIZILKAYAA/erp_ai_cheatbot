/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SCHEMA PERSISTENCE
 * Saves and loads schema mappings (table mapping, field mapping, FK graph)
 * to disk so they survive server restarts and schema refreshes.
 *
 * Storage: data/schema-mappings.json (alongside data/connections.json)
 */

import fs from 'fs/promises';
import path from 'path';
import type { TableMapping } from './tableMapping';
import type { AllFieldMappings } from './fieldMapping';

const STORE_PATH = path.join(process.cwd(), 'data', 'schema-mappings.json');

export interface FKRelation {
  column: string;
  refTable: string;
  refColumn: string;
}

export interface PersistedSchemaMapping {
  version: 1;
  database: string;
  connectionType: string;
  tableMapping: TableMapping;
  fieldMapping: AllFieldMappings;
  fkGraph: Record<string, FKRelation[]>;
  tableList: string[];
  savedAt: string;
}

/**
 * Save schema mappings to disk.
 */
export async function persistSchemaMapping(data: PersistedSchemaMapping): Promise<void> {
  const dir = path.dirname(STORE_PATH);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[SCHEMA PERSIST] Saved mappings for database "${data.database}"`);
}

/**
 * Load schema mappings from disk.
 * Returns null if file doesn't exist or is for a different database.
 */
export async function loadSchemaMapping(database: string): Promise<PersistedSchemaMapping | null> {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const data = JSON.parse(raw) as PersistedSchemaMapping;
    if (data.version !== 1) return null;
    if (data.database !== database) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Validate that persisted mappings are still compatible with the current database.
 * Checks that all mapped table names still exist in the database.
 */
export function validatePersisted(
  persisted: PersistedSchemaMapping,
  currentTableNames: string[]
): boolean {
  const current = new Set(currentTableNames.map(n => n.toLowerCase()));
  for (const tableName of Object.values(persisted.tableMapping)) {
    if (tableName && !current.has(tableName.toLowerCase())) {
      return false;
    }
  }
  return true;
}

/**
 * Build FK graph from schema cache field info.
 * Returns a map of tableName -> FK relations found in that table's columns.
 */
export function buildFKGraphFromFields(
  fields: Record<string, any[]>
): Record<string, FKRelation[]> {
  const graph: Record<string, FKRelation[]> = {};
  for (const [tableName, fieldList] of Object.entries(fields)) {
    const fks = fieldList
      .filter((f: any) => f.foreignKey)
      .map((f: any) => ({
        column: f.name,
        refTable: f.foreignKey.table,
        refColumn: f.foreignKey.column,
      }));
    if (fks.length > 0) {
      graph[tableName] = fks;
    }
  }
  return graph;
}
