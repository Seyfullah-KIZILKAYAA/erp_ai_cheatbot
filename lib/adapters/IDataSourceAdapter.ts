/**
 * DATA SOURCE ADAPTER INTERFACE
 * Universal interface for connecting to any database or ERP system.
 * All adapters (Odoo, PostgreSQL, MySQL, MSSQL, SQLite) implement this interface.
 */

export type ConnectionType = 'odoo' | 'postgresql' | 'mysql' | 'mssql' | 'sqlite';

export interface ConnectionConfig {
  type: ConnectionType;
  label: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  // Odoo-specific
  protocol?: 'http' | 'https';
  // SSL
  ssl?: boolean;
  // SQLite-specific
  filepath?: string;
}

export interface TableInfo {
  name: string;
  displayName?: string;
  schema?: string;
  rowCount?: number;
}

export interface FieldInfo {
  name: string;
  type: string;
  displayName?: string;
  required: boolean;
  primaryKey: boolean;
  foreignKey?: {
    table: string;
    column: string;
  };
}

export interface SchemaCache {
  tables: TableInfo[];
  fields: Record<string, FieldInfo[]>;
  discoveredAt: Date;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs: number;
}

export interface IDataSourceAdapter {
  readonly type: ConnectionType;
  readonly config: ConnectionConfig;

  // Connection lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<TestConnectionResult>;
  isConnected(): boolean;

  // Schema discovery
  getTables(): Promise<TableInfo[]>;
  getFields(tableName: string): Promise<FieldInfo[]>;

  // Data operations
  search(
    table: string,
    filters: any[],
    fields: string[],
    limit: number,
    order: string
  ): Promise<any[]>;

  count(table: string, filters: any[]): Promise<number>;

  create(table: string, values: Record<string, any>): Promise<number>;

  update(
    table: string,
    ids: number[],
    values: Record<string, any>
  ): Promise<boolean>;
}
