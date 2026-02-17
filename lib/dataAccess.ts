/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * UNIFIED DATA ACCESS LAYER
 * Drop-in replacements for the old odooClient functions.
 * All agents should import from this file instead of odooClient.
 *
 * Also re-exports schema helper functions for agent convenience:
 * - Field resolution: getField, getFields, getAllFieldNames
 * - Value access: getValue, getNumericValue, normalizeValue
 * - Schema context: getSchemaContextForLLM, getEntitySchemaContext
 * - Connection info: getConnectionLabel, getConnectionErrorMessage
 */

import { getActiveAdapter, getSchemaCache, getTableFields as getFieldsFromCache } from './adapters/ConnectionManager';
import { getTableMapping, TableMapping } from './config/tableMapping';

// Re-export schema helpers for agent convenience
export {
  normalizeValue,
  normalizeId,
  getField,
  getFields,
  getAllFieldNames,
  getValue,
  getNumericValue,
  getRawValue,
  getConnectionLabel,
  getConnectionErrorMessage,
  getSchemaContextForLLM,
  getEntitySchemaContext,
  isOdooConnection,
  discoverAndMapFields
} from './adapters/schemaHelper';

export type { AllFieldMappings } from './config/fieldMapping';

/**
 * Search records from the active data source.
 * Replaces searchReadOdoo().
 */
export async function searchData(
  table: string,
  filters: any[] = [],
  fields: string[] = [],
  limit: number = 10,
  order: string = ''
): Promise<any[]> {
  const adapter = await getActiveAdapter();
  return adapter.search(table, filters, fields, limit, order);
}

/**
 * Count records from the active data source.
 * Replaces countOdoo().
 */
export async function countData(
  table: string,
  filters: any[] = []
): Promise<number> {
  const adapter = await getActiveAdapter();
  return adapter.count(table, filters);
}

/**
 * Create a new record in the active data source.
 * Replaces createOdoo().
 */
export async function createRecord(
  table: string,
  values: Record<string, any>
): Promise<number> {
  const adapter = await getActiveAdapter();
  return adapter.create(table, values);
}

/**
 * Update existing records in the active data source.
 * Replaces writeOdoo().
 */
export async function updateRecord(
  table: string,
  ids: number[],
  values: Record<string, any>
): Promise<boolean> {
  const adapter = await getActiveAdapter();
  return adapter.update(table, ids, values);
}

/**
 * Get all available table names from the connected database.
 */
export async function getAvailableTables(): Promise<string[]> {
  const cache = await getSchemaCache();
  return cache.tables.map(t => t.name);
}

/**
 * Get field names for a specific table.
 */
export async function getTableFieldNames(table: string): Promise<string[]> {
  const fields = await getFieldsFromCache(table);
  return fields.map((f: any) => f.name);
}

/**
 * Get the current table mapping.
 * Convenience re-export for agents.
 */
export function getTables(): TableMapping {
  return getTableMapping();
}
