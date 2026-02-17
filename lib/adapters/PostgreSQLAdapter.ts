/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POSTGRESQL ADAPTER
 * Implements IDataSourceAdapter for PostgreSQL databases.
 */

import {
  IDataSourceAdapter,
  ConnectionConfig,
  TableInfo,
  FieldInfo,
  TestConnectionResult,
} from './IDataSourceAdapter';
import { translateFilters, translateOrder } from './filterTranslator';

let pg: any = null;

async function getPg() {
  if (!pg) {
    pg = await import('pg');
  }
  return pg;
}

export class PostgreSQLAdapter implements IDataSourceAdapter {
  readonly type = 'postgresql' as const;
  readonly config: ConnectionConfig;
  private pool: any = null;
  private _connected = false;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  private async getPool() {
    if (!this.pool) {
      const { Pool } = await getPg();
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      });
    }
    return this.pool;
  }

  async connect(): Promise<void> {
    const pool = await this.getPool();
    const client = await pool.connect();
    client.release();
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
    this._connected = false;
  }

  async testConnection(): Promise<TestConnectionResult> {
    const start = Date.now();
    try {
      const pool = await this.getPool();
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      this._connected = true;
      return {
        success: true,
        message: `PostgreSQL'e basariyla baglandi (${this.config.host}:${this.config.port}/${this.config.database})`,
        latencyMs: Date.now() - start,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Baglanti hatasi: ${error.message}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  isConnected(): boolean {
    return this._connected;
  }

  async getTables(): Promise<TableInfo[]> {
    const pool = await this.getPool();
    const result = await pool.query(`
      SELECT table_name, table_schema
      FROM information_schema.tables
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
        AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name
    `);

    return result.rows.map((row: any) => ({
      name: row.table_name,
      displayName: row.table_name.replace(/_/g, ' '),
      schema: row.table_schema,
    }));
  }

  async getFields(tableName: string): Promise<FieldInfo[]> {
    const pool = await this.getPool();

    // Get columns
    const colResult = await pool.query(
      `SELECT
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        tc.constraint_type
      FROM information_schema.columns c
      LEFT JOIN information_schema.key_column_usage kcu
        ON c.table_name = kcu.table_name AND c.column_name = kcu.column_name
      LEFT JOIN information_schema.table_constraints tc
        ON kcu.constraint_name = tc.constraint_name AND tc.table_name = c.table_name
      WHERE c.table_name = $1
      ORDER BY c.ordinal_position`,
      [tableName]
    );

    // Get foreign keys
    const fkResult = await pool.query(
      `SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table,
        ccu.column_name AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = $1 AND tc.constraint_type = 'FOREIGN KEY'`,
      [tableName]
    );

    const fkMap = new Map<string, { table: string; column: string }>();
    for (const fk of fkResult.rows) {
      fkMap.set(fk.column_name, { table: fk.foreign_table, column: fk.foreign_column });
    }

    return colResult.rows.map((col: any) => ({
      name: col.column_name,
      type: col.data_type,
      displayName: col.column_name.replace(/_/g, ' '),
      required: col.is_nullable === 'NO',
      primaryKey: col.constraint_type === 'PRIMARY KEY',
      foreignKey: fkMap.get(col.column_name),
    }));
  }

  async search(
    table: string,
    filters: any[] = [],
    fields: string[] = [],
    limit: number = 10,
    order: string = ''
  ): Promise<any[]> {
    const pool = await this.getPool();
    const { whereClause, params } = translateFilters(filters, 'dollar');

    const selectFields = fields.length > 0
      ? fields.map(f => `"${f}"`).join(', ')
      : '*';

    const orderBy = translateOrder(order);

    let query = `SELECT ${selectFields} FROM "${table}"`;
    if (whereClause) query += ` WHERE ${whereClause}`;
    if (orderBy) query += ` ORDER BY ${orderBy}`;
    query += ` LIMIT ${limit}`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  async count(table: string, filters: any[] = []): Promise<number> {
    const pool = await this.getPool();
    const { whereClause, params } = translateFilters(filters, 'dollar');

    let query = `SELECT COUNT(*) as count FROM "${table}"`;
    if (whereClause) query += ` WHERE ${whereClause}`;

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count);
  }

  async create(table: string, values: Record<string, any>): Promise<number> {
    const pool = await this.getPool();
    const keys = Object.keys(values);
    const cols = keys.map(k => `"${k}"`).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const vals = Object.values(values);

    const result = await pool.query(
      `INSERT INTO "${table}" (${cols}) VALUES (${placeholders}) RETURNING id`,
      vals
    );
    return result.rows[0]?.id || 0;
  }

  async update(
    table: string,
    ids: number[],
    values: Record<string, any>
  ): Promise<boolean> {
    const pool = await this.getPool();
    const keys = Object.keys(values);
    const setClauses = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
    const vals = [...Object.values(values), ids];

    const idPlaceholders = ids.map((_, i) => `$${keys.length + i + 1}`).join(', ');

    await pool.query(
      `UPDATE "${table}" SET ${setClauses} WHERE id IN (${idPlaceholders})`,
      vals
    );
    return true;
  }
}
