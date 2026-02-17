/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SCHEMA HELPER
 * Provides dynamic field resolution, data normalization, and schema context
 * for agents working with any database type (not just Odoo).
 *
 * Key capabilities:
 * - Dynamic field resolution: agents query using actual field names from the connected database
 * - Data normalization: handles Odoo many2one [id, "name"] arrays vs regular SQL values
 * - Schema context for LLM prompts: so the AI knows what tables/fields actually exist
 * - Connection-aware error messages and labels
 */

import { getConnectionType, getSchemaCache, hasActiveConnection } from './ConnectionManager';
import { getTableMapping } from '@/lib/config/tableMapping';
import { resolveField, resolveFields, getFieldMapping, autoDetectAllFieldMappings, AllFieldMappings } from '@/lib/config/fieldMapping';
import type { FieldInfo } from './IDataSourceAdapter';

// ─── Data Normalization ─────────────────────────────────────────────────────

/**
 * Normalize a value that might be an Odoo many2one array [id, "name"] to a plain value.
 * - Odoo returns: [42, "Customer Name"] → returns "Customer Name"
 * - SQL returns: "Customer Name" or 42 → returns as-is
 * - null/false → returns fallback
 */
export function normalizeValue(value: any, fallback: string = '-'): string {
  if (value === null || value === undefined || value === false) {
    return fallback;
  }
  if (Array.isArray(value)) {
    return value.length >= 2 ? String(value[1]) : (value.length === 1 ? String(value[0]) : fallback);
  }
  return String(value);
}

/**
 * Normalize a value to number, handling Odoo many2one arrays.
 * - Odoo many2one [42, "Name"] → returns 42
 * - Plain number → returns as-is
 */
export function normalizeId(value: any): number | null {
  if (value === null || value === undefined || value === false) return null;
  if (Array.isArray(value)) return value.length > 0 ? Number(value[0]) : null;
  return Number(value);
}

/**
 * Check if the current connection is Odoo.
 */
export function isOdooConnection(): boolean {
  return getConnectionType() === 'odoo';
}

// ─── Dynamic Field Resolution ───────────────────────────────────────────────

/**
 * Get the actual field name for a semantic concept in a given entity.
 * Example: getField('salesOrders', 'customer') → 'partner_id' (Odoo) or 'customer_id' (SQL)
 */
export function getField(entity: keyof AllFieldMappings, semanticField: string): string {
  return resolveField(entity, semanticField) || semanticField;
}

/**
 * Get an array of actual field names for data queries.
 * Example: getFields('salesOrders', ['id', 'name', 'customer', 'totalAmount']) → ['id', 'name', 'partner_id', 'amount_total']
 */
export function getFields(entity: keyof AllFieldMappings, semanticFields: string[]): string[] {
  const resolved = resolveFields(entity, semanticFields);
  return resolved.length > 0 ? resolved : semanticFields;
}

/**
 * Get all mapped field names for an entity (useful for "fetch all relevant fields").
 */
export function getAllFieldNames(entity: keyof AllFieldMappings): string[] {
  const mapping = getFieldMapping(entity);
  return Object.values(mapping);
}

// ─── Record Value Access ────────────────────────────────────────────────────

/**
 * Get a display value from a record using a semantic field name.
 * Automatically normalizes Odoo many2one arrays.
 * Example: getValue(record, 'salesOrders', 'customer') → "Acme Ltd"
 */
export function getValue(record: any, entity: keyof AllFieldMappings, semanticField: string, fallback: string = '-'): string {
  const actualField = getField(entity, semanticField);
  return normalizeValue(record[actualField], fallback);
}

/**
 * Get a numeric value from a record using a semantic field name.
 * Example: getNumericValue(record, 'salesOrders', 'totalAmount') → 5000
 */
export function getNumericValue(record: any, entity: keyof AllFieldMappings, semanticField: string, fallback: number = 0): number {
  const actualField = getField(entity, semanticField);
  const val = record[actualField];
  if (val === null || val === undefined || val === false) return fallback;
  return Number(val) || fallback;
}

/**
 * Get a raw value from a record using a semantic field name.
 */
export function getRawValue(record: any, entity: keyof AllFieldMappings, semanticField: string): any {
  const actualField = getField(entity, semanticField);
  return record[actualField];
}

// ─── Connection Info ────────────────────────────────────────────────────────

const CONNECTION_LABELS: Record<string, string> = {
  odoo: 'Odoo ERP',
  postgresql: 'PostgreSQL veritabanı',
  mysql: 'MySQL veritabanı',
  mssql: 'SQL Server veritabanı',
  sqlite: 'SQLite veritabanı'
};

/**
 * Get human-readable connection type label.
 * Example: "Odoo ERP" or "PostgreSQL veritabanı"
 */
export function getConnectionLabel(): string {
  const type = getConnectionType();
  return type ? (CONNECTION_LABELS[type] || type) : 'Veritabanı';
}

/**
 * Get generic error message for connection failures.
 */
export function getConnectionErrorMessage(): string {
  const label = getConnectionLabel();
  return `⚠️ ${label} sistemine bağlanılamıyor. Lütfen bağlantı ayarlarınızı kontrol edin.`;
}

// ─── Schema Context for LLM ────────────────────────────────────────────────

/**
 * Build schema context string for LLM agent prompts.
 * Includes available tables and their fields so the AI knows the actual data structure.
 */
export async function getSchemaContextForLLM(): Promise<string> {
  if (!hasActiveConnection()) {
    return 'Veritabanı bağlantısı yapılmamış.';
  }

  const connType = getConnectionType();
  const label = getConnectionLabel();
  const tables = getTableMapping();

  let context = `BAĞLI VERİ KAYNAĞI: ${label}\n`;
  context += `Bağlantı Tipi: ${connType}\n\n`;

  try {
    const cache = await getSchemaCache();
    const mappedTables = Object.entries(tables);
    context += `TABLO YAPISI:\n`;

    for (const [semantic, tableName] of mappedTables) {
      const fields = cache.fields[tableName];
      if (fields && fields.length > 0) {
        const fieldList = fields.slice(0, 15).map((f: FieldInfo) => `${f.name} (${f.type})`).join(', ');
        context += `- ${semantic} → "${tableName}": ${fieldList}\n`;
      } else {
        context += `- ${semantic} → "${tableName}"\n`;
      }
    }

    context += `\nToplam keşfedilen tablo: ${cache.tables.length}\n`;
  } catch {
    context += 'Şema bilgisi henüz yüklenemedi.\n';
  }

  return context;
}

/**
 * Get a concise schema description for agent-specific prompts.
 * Only returns fields relevant to a specific entity.
 */
export async function getEntitySchemaContext(entity: keyof AllFieldMappings): Promise<string> {
  const mapping = getFieldMapping(entity);
  const tables = getTableMapping();
  const tableName = (tables as any)[entity] || entity;

  let context = `Tablo: "${tableName}"\n`;
  context += `Alanlar: `;
  context += Object.entries(mapping)
    .map(([semantic, actual]) => `${semantic}→${actual}`)
    .join(', ');

  return context;
}

// ─── Schema Discovery Integration ──────────────────────────────────────────

/**
 * Discover and auto-map fields for all mapped tables.
 * Called after schema discovery to update field mappings.
 */
export async function discoverAndMapFields(): Promise<void> {
  try {
    const cache = await getSchemaCache();
    const tables = getTableMapping();
    const entityFields: Record<string, string[]> = {};

    for (const [entity, tableName] of Object.entries(tables)) {
      const fields = cache.fields[tableName];
      if (fields && fields.length > 0) {
        entityFields[entity] = fields.map((f: FieldInfo) => f.name);
      }
    }

    if (Object.keys(entityFields).length > 0) {
      autoDetectAllFieldMappings(entityFields);
    }
  } catch (error) {
    console.warn('Field mapping auto-detection failed:', error);
  }
}
