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
import { getTableMapping, isEntityMapped, TableMapping } from './config/tableMapping';

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
 * Validate that a table name is mapped before querying.
 * Throws a descriptive error if the table is empty (unmapped entity).
 */
function validateTable(table: string): void {
  if (!table) {
    throw new Error('Bu veri bu veritabaninda mevcut degil. Bagli veritabaninda ilgili tablo bulunamadi.');
  }
}

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
  validateTable(table);
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
  validateTable(table);
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
  validateTable(table);
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
  validateTable(table);
  const adapter = await getActiveAdapter();
  return adapter.update(table, ids, values);
}

/**
 * Search records and automatically resolve foreign key references to display names.
 * For each FK field in the results, fetches the related record's display name
 * and adds it as `{fieldName}_display` property.
 *
 * Example: If Siparisler.MusteriID → Musteriler.MusteriID,
 * the result will include `MusteriID_display: "Acme Ltd"` alongside `MusteriID: 42`.
 */
export async function searchDataWithRelations(
  table: string,
  filters: any[] = [],
  fields: string[] = [],
  limit: number = 10,
  order: string = ''
): Promise<any[]> {
  validateTable(table);
  const adapter = await getActiveAdapter();

  // Get FK info from schema cache BEFORE querying
  const cache = await getSchemaCache();
  const tableFields = cache.fields[table];

  // Auto-add FK columns to the query so relation resolver can work
  let queryFields = [...fields];
  if (tableFields && queryFields.length > 0) {
    for (const f of tableFields) {
      if (f.foreignKey && !queryFields.includes(f.name)) {
        queryFields.push(f.name);
      }
    }
  }

  const data = await adapter.search(table, filters, queryFields, limit, order);

  if (!data || data.length === 0) return data;
  if (!tableFields) return data;

  // Find FK fields that exist in the query results
  const fkFields = tableFields.filter(f =>
    f.foreignKey && data[0][f.name] !== undefined
  );

  if (fkFields.length === 0) return data;

  // Resolve each FK
  for (const fkField of fkFields) {
    const fk = fkField.foreignKey!;

    // Collect unique FK values
    const fkValues = [...new Set(
      data.map(r => r[fkField.name]).filter(v => v !== null && v !== undefined)
    )];

    if (fkValues.length === 0) continue;

    // Find the display column in the referenced table
    const refFields = cache.fields[fk.table];
    const displayCol = findDisplayColumn(refFields, fk.column);
    if (!displayCol) continue;

    // Batch fetch from the referenced table
    try {
      const refData = await adapter.search(
        fk.table,
        [[fk.column, "in", fkValues]],
        [fk.column, displayCol],
        fkValues.length,
        ''
      );

      // Build lookup map: FK value → display name
      const lookup = new Map<any, string>();
      for (const ref of refData) {
        lookup.set(ref[fk.column], String(ref[displayCol] || ''));
      }

      // Augment original records
      const displayKey = `${fkField.name}_display`;
      for (const record of data) {
        const val = record[fkField.name];
        if (val !== null && val !== undefined && lookup.has(val)) {
          record[displayKey] = lookup.get(val);
        }
      }
    } catch {
      // Non-critical - continue without resolved names
    }
  }

  return data;
}

// ─── Multi-Hop FK Resolution ─────────────────────────────────────────────

interface FKEdge {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

/**
 * Build a complete FK edge list from the schema cache.
 */
function buildFKEdges(cache: { fields: Record<string, any[]> }): FKEdge[] {
  const edges: FKEdge[] = [];
  for (const [tableName, fieldList] of Object.entries(cache.fields)) {
    for (const field of fieldList) {
      if (field.foreignKey) {
        edges.push({
          fromTable: tableName,
          fromColumn: field.name,
          toTable: field.foreignKey.table,
          toColumn: field.foreignKey.column,
        });
      }
    }
  }
  return edges;
}

/**
 * Find shortest FK chain between two tables using BFS.
 * Returns the chain of edges to traverse, or null if no path exists.
 *
 * Example: resolveFKChain("Odemeler", "Musteriler") returns:
 * [
 *   { fromTable: "Odemeler", fromColumn: "FaturaID", toTable: "Faturalar", toColumn: "FaturaID" },
 *   { fromTable: "Faturalar", fromColumn: "SiparisID", toTable: "Siparisler", toColumn: "SiparisID" },
 *   { fromTable: "Siparisler", fromColumn: "MusteriID", toTable: "Musteriler", toColumn: "MusteriID" },
 * ]
 */
export function resolveFKChain(
  fromTable: string,
  toTable: string,
  fkEdges: FKEdge[],
  maxHops: number = 4
): FKEdge[] | null {
  if (fromTable === toTable) return [];

  const queue: { table: string; path: FKEdge[] }[] = [{ table: fromTable, path: [] }];
  const visited = new Set<string>([fromTable]);

  while (queue.length > 0) {
    const { table, path } = queue.shift()!;
    if (path.length >= maxHops) continue;

    const outgoing = fkEdges.filter(e => e.fromTable === table);
    for (const edge of outgoing) {
      if (edge.toTable === toTable) {
        return [...path, edge];
      }
      if (!visited.has(edge.toTable)) {
        visited.add(edge.toTable);
        queue.push({ table: edge.toTable, path: [...path, edge] });
      }
    }
  }
  return null;
}

/**
 * Search data and resolve multi-hop FK chains to reach a target table.
 * Walks through intermediate tables to resolve display names from a distant table.
 *
 * Example: From Odemeler, resolve through Faturalar -> Siparisler -> Musteriler
 * to get customer names for each payment.
 *
 * Returns the original records augmented with `{targetTable}_display` property.
 */
export async function searchDataWithMultiHopRelations(
  table: string,
  filters: any[] = [],
  fields: string[] = [],
  limit: number = 10,
  order: string = '',
  targetTable: string,
  targetDisplayColumn?: string
): Promise<any[]> {
  validateTable(table);
  const adapter = await getActiveAdapter();
  const cache = await getSchemaCache();

  const fkEdges = buildFKEdges(cache);
  const chain = resolveFKChain(table, targetTable, fkEdges);

  if (!chain || chain.length === 0) {
    // No FK chain found, fall back to single-hop
    return searchDataWithRelations(table, filters, fields, limit, order);
  }

  // Ensure the first FK column is in the query
  const queryFields = [...fields];
  if (!queryFields.includes(chain[0].fromColumn)) {
    queryFields.push(chain[0].fromColumn);
  }

  const data = await adapter.search(table, filters, queryFields, limit, order);
  if (!data || data.length === 0) return data;

  // Walk the chain hop by hop, building lookup maps
  // We need to trace: original FK values → intermediate tables → final display values
  type LookupChain = Map<any, any>; // value at hop N → value at hop N+1

  let currentValues = [...new Set(
    data.map(r => r[chain[0].fromColumn]).filter(v => v !== null && v !== undefined)
  )];

  if (currentValues.length === 0) return data;

  // Build chain of lookups: each maps values at step N to values at step N+1
  const lookupChain: LookupChain[] = [];

  for (let i = 0; i < chain.length; i++) {
    const edge = chain[i];
    const isLast = i === chain.length - 1;

    const fetchFields = [edge.toColumn];
    if (isLast) {
      const displayCol = targetDisplayColumn ||
        findDisplayColumn(cache.fields[edge.toTable], edge.toColumn);
      if (displayCol) fetchFields.push(displayCol);
    }
    if (!isLast) {
      fetchFields.push(chain[i + 1].fromColumn);
    }

    try {
      const refData = await adapter.search(
        edge.toTable,
        [[edge.toColumn, 'in', currentValues]],
        fetchFields,
        currentValues.length,
        ''
      );

      const lookup = new Map<any, any>();

      if (isLast) {
        const displayCol = targetDisplayColumn ||
          findDisplayColumn(cache.fields[edge.toTable], edge.toColumn);
        for (const ref of refData) {
          lookup.set(ref[edge.toColumn], displayCol ? String(ref[displayCol] || '') : String(ref[edge.toColumn]));
        }
      } else {
        // Map: current PK value → next FK value
        const nextFKCol = chain[i + 1].fromColumn;
        for (const ref of refData) {
          lookup.set(ref[edge.toColumn], ref[nextFKCol]);
        }
        // Update currentValues for next hop
        currentValues = [...new Set(refData.map(r => r[nextFKCol]).filter(Boolean))];
      }

      lookupChain.push(lookup);
    } catch {
      return data; // Can't resolve, return original data
    }
  }

  // Now trace each original record through the full chain
  const displayKey = `${targetTable}_display`;
  for (const record of data) {
    let value = record[chain[0].fromColumn];
    if (value === null || value === undefined) continue;

    let resolved = true;
    for (const lookup of lookupChain) {
      if (lookup.has(value)) {
        value = lookup.get(value);
      } else {
        resolved = false;
        break;
      }
    }

    if (resolved && value !== null && value !== undefined) {
      record[displayKey] = value;
    }
  }

  return data;
}

/**
 * Find the best "display name" column in a referenced table.
 * Tries common naming patterns for name/title columns.
 */
function findDisplayColumn(fields: any[] | undefined, pkColumn: string): string | null {
  if (!fields || fields.length === 0) return null;

  const namePatterns = [
    /^ad$/i, /adi$/i, /^name$/i, /^title$/i, /^description$/i,
    /^label$/i, /^display/i, /^isim/i, /^baslik$/i, /^tanim$/i
  ];

  // Try matching known name patterns
  for (const pattern of namePatterns) {
    const match = fields.find(f => pattern.test(f.name) && f.name !== pkColumn);
    if (match) return match.name;
  }

  // Fallback: first non-PK string/varchar column
  const stringField = fields.find(f =>
    !f.primaryKey &&
    f.name !== pkColumn &&
    /varchar|nvarchar|text|char|string/i.test(f.type)
  );
  if (stringField) return stringField.name;

  // Last fallback: second column (after PK)
  const nonPK = fields.filter(f => !f.primaryKey && f.name !== pkColumn);
  return nonPK.length > 0 ? nonPK[0].name : null;
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

/**
 * Check if a specific entity has a valid table mapping.
 * Agents can use this to provide user-friendly messages
 * when the connected database lacks certain tables.
 */
export { isEntityMapped } from './config/tableMapping';
