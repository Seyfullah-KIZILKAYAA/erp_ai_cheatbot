/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CONNECTION MANAGER (Singleton)
 * Manages the active database adapter, schema cache, and connection lifecycle.
 * Server-side only - do not import from client components.
 */

import { ConnectionConfig, IDataSourceAdapter, SchemaCache } from './IDataSourceAdapter';
import { createAdapter } from './AdapterFactory';
import { getTableMapping, autoDetectAndSaveMapping } from '@/lib/config/tableMapping';
import { autoDetectAllFieldMappings } from '@/lib/config/fieldMapping';

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
 * Get the active adapter. Initializes from env vars if needed.
 * Throws if no connection is configured.
 */
export async function getActiveAdapter(): Promise<IDataSourceAdapter> {
  if (activeAdapter && activeAdapter.isConnected()) {
    return activeAdapter;
  }

  // Try to reconnect existing config
  if (currentConfig) {
    activeAdapter = createAdapter(currentConfig);
    await activeAdapter.connect();
    return activeAdapter;
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
 */
export async function getSchemaCache(): Promise<SchemaCache> {
  // Check TTL
  if (schemaCache && (Date.now() - schemaCache.discoveredAt.getTime()) < SCHEMA_CACHE_TTL) {
    return schemaCache;
  }

  const adapter = await getActiveAdapter();
  const tables = await adapter.getTables();

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

  // Auto-detect table mapping for the new schema
  try {
    await autoDetectAndSaveMapping(tables.map(t => t.name));
  } catch {
    // Non-critical - mapping can be done later
  }

  // Auto-detect field mappings for discovered tables
  try {
    const entityFields: Record<string, string[]> = {};
    const tableMapping = getTableMapping();
    for (const [entity, tableName] of Object.entries(tableMapping)) {
      if (fields[tableName] && fields[tableName].length > 0) {
        entityFields[entity] = fields[tableName].map((f: any) => f.name);
      }
    }
    if (Object.keys(entityFields).length > 0) {
      autoDetectAllFieldMappings(entityFields);
    }
  } catch {
    // Non-critical - field mapping can use defaults
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
  const fields = await adapter.getFields(tableName);
  cache.fields[tableName] = fields;
  return fields;
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
