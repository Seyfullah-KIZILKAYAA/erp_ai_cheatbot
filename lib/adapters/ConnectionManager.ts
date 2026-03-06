/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CONNECTION MANAGER (Singleton)
 * Manages the active database adapter, schema cache, and connection lifecycle.
 * Server-side only - do not import from client components.
 *
 * Schema discovery flow:
 * 1. Connect to database
 * 2. Discover tables & fields
 * 3. Pattern-based auto-detect mapping
 * 4. If unmapped entities remain → LLM-based Schema Mapper Agent
 * 5. Auto-detect field mappings for all mapped tables
 */

import { ConnectionConfig, IDataSourceAdapter, SchemaCache } from './IDataSourceAdapter';
import { createAdapter } from './AdapterFactory';
import { getTableMapping, autoDetectMapping, autoDetectAndSaveMapping, getUnmappedEntities, applyLLMFullMapping, setTableMapping, EMPTY_MAPPING } from '@/lib/config/tableMapping';
import { autoDetectAllFieldMappings, setFieldMapping, supplementFieldMappings, setAllFieldMappings, getAllFieldMappings } from '@/lib/config/fieldMapping';
import { mapFullSchemaWithLLM } from '@/lib/agents/schemaMapperAgent';
import type { SchemaTableInput } from '@/lib/agents/schemaMapperAgent';
import { getConnection, toConnectionConfig } from '@/lib/services/connectionStore';
import { loadSchemaMapping, persistSchemaMapping, validatePersisted, buildFKGraphFromFields } from '@/lib/config/schemaPersistence';

// Module-level singleton state
let activeAdapter: IDataSourceAdapter | null = null;
let schemaCache: SchemaCache | null = null;
let currentConfig: ConnectionConfig | null = null;

const SCHEMA_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Initialize connection from environment variables (backward compatibility).
 * Called on first data access if no connection has been configured.
 */
async function initFromEnv(): Promise<boolean> {
  const url = process.env.ODOO_URL;
  const db = process.env.ODOO_DB;
  const username = process.env.ODOO_USERNAME;
  const password = process.env.ODOO_PASSWORD;

  if (url && db && username && password) {
    const parsed = new URL(url);
    const config: ConnectionConfig = {
      type: 'odoo',
      label: 'Odoo (env)',
      host: parsed.hostname,
      port: parseInt(parsed.port) || (parsed.protocol === 'https:' ? 443 : 8069),
      database: db,
      username,
      password,
      protocol: parsed.protocol === 'https:' ? 'https' : 'http',
    };
    await setConnection(config);
    return true;
  }
  return false;
}

/**
 * Get the active adapter. Initializes from saved config, env vars, or throws.
 * Restore order: in-memory config → saved connection file → env vars.
 */
export async function getActiveAdapter(): Promise<IDataSourceAdapter> {
  if (activeAdapter && activeAdapter.isConnected()) {
    return activeAdapter;
  }

  // Try to reconnect existing in-memory config
  if (currentConfig) {
    activeAdapter = createAdapter(currentConfig);
    await activeAdapter.connect();
    return activeAdapter;
  }

  // Try to restore from saved connection file (data/connections.json)
  try {
    const saved = await getConnection();
    if (saved) {
      const config = toConnectionConfig(saved);
      console.log(`🔄 [CONNECTION] Restoring saved ${config.type} connection to ${config.host}/${config.database}`);
      await setConnection(config);
      return activeAdapter!;
    }
  } catch (err) {
    console.warn('[CONNECTION] Failed to restore saved connection:', err);
  }

  // Try env vars as fallback
  const envInit = await initFromEnv();
  if (envInit && activeAdapter) {
    return activeAdapter;
  }

  throw new Error('Veritabani baglantisi yapilandirilmamis. Lutfen baglanti sihirbazini kullanin.');
}

/**
 * Set a new connection configuration and connect.
 */
export async function setConnection(config: ConnectionConfig): Promise<void> {
  // Disconnect existing
  if (activeAdapter) {
    try { await activeAdapter.disconnect(); } catch { /* ignore */ }
  }

  currentConfig = config;
  activeAdapter = createAdapter(config);
  await activeAdapter.connect();

  // Clear schema cache on new connection
  schemaCache = null;
}

/**
 * Get the schema cache, discovering schema if needed.
 * Runs the full mapping pipeline: pattern match → LLM fallback → field mapping.
 */
export async function getSchemaCache(): Promise<SchemaCache> {
  // Check TTL
  if (schemaCache && (Date.now() - schemaCache.discoveredAt.getTime()) < SCHEMA_CACHE_TTL) {
    return schemaCache;
  }

  const adapter = await getActiveAdapter();
  const connType = currentConfig?.type || 'unknown';
  const tables = await adapter.getTables();

  console.log(`📊 [SCHEMA] Discovered ${tables.length} tables from ${connType} database`);

  // Discover fields for commonly used tables (first 50 to avoid overload)
  const fields: Record<string, any[]> = {};
  const tablesToDiscover = tables.slice(0, 50);

  for (const table of tablesToDiscover) {
    try {
      fields[table.name] = await adapter.getFields(table.name);
    } catch {
      fields[table.name] = [];
    }
  }

  schemaCache = {
    tables,
    fields,
    discoveredAt: new Date(),
  };

  // Build FK graph from discovered fields
  const fkGraph = buildFKGraphFromFields(fields);
  const tableNames = tables.map(t => t.name);

  // Step 1: Check for persisted mappings (from previous LLM run)
  const dbName = currentConfig?.database || 'unknown';
  try {
    const persisted = await loadSchemaMapping(dbName);
    if (persisted && validatePersisted(persisted, tableNames)) {
      setTableMapping(persisted.tableMapping);
      setAllFieldMappings(persisted.fieldMapping);
      console.log(`[SCHEMA] Loaded persisted mappings for "${dbName}"`);

      const finalUnmapped = getUnmappedEntities();
      if (finalUnmapped.length > 0) {
        console.log(`[SCHEMA] Persisted unmapped: [${finalUnmapped.join(', ')}]`);
      } else {
        console.log(`[SCHEMA] All entities mapped (from persisted)`);
      }
      return schemaCache;
    }
  } catch {
    // Non-critical — continue to fresh mapping
  }

  // Step 2: Quick pattern matching as HINTS (not final mapping)
  let patternHints: Partial<import('@/lib/config/tableMapping').TableMapping> = {};
  try {
    patternHints = autoDetectMapping(tableNames);
    const hintCount = Object.values(patternHints).filter(v => v).length;
    console.log(`[SCHEMA] Pattern matching found ${hintCount} hints`);
  } catch {
    // Non-critical
  }

  // Step 3: LLM-FIRST mapping (for non-Odoo connections)
  if (connType !== 'odoo') {
    try {
      // Build FK-enriched schema input for LLM
      const schemaInput: SchemaTableInput[] = tables.map(t => ({
        name: t.name,
        fields: (fields[t.name] || []).map((f: any) => ({
          name: f.name,
          type: f.type || 'unknown',
          primaryKey: f.primaryKey || false,
        })),
        foreignKeys: (fkGraph[t.name] || []).map(fk => ({
          column: fk.column,
          refTable: fk.refTable,
          refColumn: fk.refColumn,
        })),
      }));

      const llmResult = await mapFullSchemaWithLLM(schemaInput, patternHints);

      // Apply LLM table mapping as PRIMARY (overwrites everything)
      if (Object.keys(llmResult.tableMapping).length > 0) {
        applyLLMFullMapping(llmResult.tableMapping);
        console.log(`[SCHEMA] LLM mapped ${Object.keys(llmResult.tableMapping).length} tables`);
      } else {
        // LLM returned nothing — fallback to pattern matching
        console.warn(`[SCHEMA] LLM returned no table mappings, falling back to patterns`);
        await autoDetectAndSaveMapping(tableNames, connType);
      }

      // Apply LLM field mappings as PRIMARY
      if (Object.keys(llmResult.fieldMappings).length > 0) {
        for (const [entity, fieldMap] of Object.entries(llmResult.fieldMappings)) {
          if (fieldMap && Object.keys(fieldMap).length > 0) {
            setFieldMapping(entity as any, fieldMap);
          }
        }
        console.log(`[SCHEMA] LLM mapped fields for ${Object.keys(llmResult.fieldMappings).length} entities`);
      }
    } catch (err) {
      console.warn(`[SCHEMA] LLM mapping failed, falling back to pattern matching:`, err);
      await autoDetectAndSaveMapping(tableNames, connType);
    }
  } else {
    // Odoo: use pattern matching as primary (Odoo names are standardized)
    await autoDetectAndSaveMapping(tableNames, connType);
  }

  // Step 4: Pattern-based field supplement (fills gaps LLM may have missed)
  try {
    const entityFields: Record<string, string[]> = {};
    const tableMapping = getTableMapping();
    for (const [entity, tableName] of Object.entries(tableMapping)) {
      if (tableName && fields[tableName] && fields[tableName].length > 0) {
        entityFields[entity] = fields[tableName].map((f: any) => f.name);
      }
    }
    if (Object.keys(entityFields).length > 0) {
      if (connType === 'odoo') {
        autoDetectAllFieldMappings(entityFields, connType);
      } else {
        supplementFieldMappings(entityFields);
      }
      console.log(`[SCHEMA] Field supplement complete`);
    }
  } catch {
    // Non-critical
  }

  // Step 5: Persist mappings to disk
  try {
    await persistSchemaMapping({
      version: 1,
      database: dbName,
      connectionType: connType,
      tableMapping: getTableMapping(),
      fieldMapping: getAllFieldMappings(),
      fkGraph,
      tableList: tableNames,
      savedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`[SCHEMA] Failed to persist mappings:`, err);
  }

  // Log final mapping status
  const finalUnmapped = getUnmappedEntities();
  if (finalUnmapped.length > 0) {
    console.log(`[SCHEMA] Final unmapped entities: [${finalUnmapped.join(', ')}] — these features will be unavailable`);
  } else {
    console.log(`[SCHEMA] All entities successfully mapped!`);
  }

  return schemaCache;
}

/**
 * Force refresh schema cache.
 */
export async function refreshSchema(): Promise<SchemaCache> {
  schemaCache = null;
  return getSchemaCache();
}

/**
 * Get fields for a specific table (lazy-loads if not cached).
 */
export async function getTableFields(tableName: string): Promise<any[]> {
  const cache = await getSchemaCache();
  if (cache.fields[tableName]) {
    return cache.fields[tableName];
  }

  // Lazy load
  const adapter = await getActiveAdapter();
  const fieldsList = await adapter.getFields(tableName);
  cache.fields[tableName] = fieldsList;
  return fieldsList;
}

/**
 * Check if a connection is active.
 */
export function hasActiveConnection(): boolean {
  return activeAdapter !== null && activeAdapter.isConnected();
}

/**
 * Get current connection type.
 */
export function getConnectionType(): string | null {
  return currentConfig?.type || null;
}

/**
 * Get current connection config (password masked).
 */
export function getConnectionInfo(): any {
  if (!currentConfig) return null;
  return {
    type: currentConfig.type,
    label: currentConfig.label,
    host: currentConfig.host,
    port: currentConfig.port,
    database: currentConfig.database,
    username: currentConfig.username,
    ssl: currentConfig.ssl,
    protocol: currentConfig.protocol,
  };
}

/**
 * Disconnect and clear all state.
 */
export async function disconnect(): Promise<void> {
  if (activeAdapter) {
    try { await activeAdapter.disconnect(); } catch { /* ignore */ }
  }
  activeAdapter = null;
  schemaCache = null;
  currentConfig = null;
}

// Re-export for convenience
export { getTableMapping };
