/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MYSQL ADAPTER
 * Implements IDataSourceAdapter for MySQL databases.
 */

import {
  IDataSourceAdapter,
  ConnectionConfig,
  TableInfo,
  FieldInfo,
  TestConnectionResult,
} from './IDataSourceAdapter';
import { translateFilters, translateOrder } from './filterTranslator';

let mysql2: any = null;

async function getMySQL() {
  if (!mysql2) {
    mysql2 = await import('mysql2/promise');
  }
  return mysql2;
}

export class MySQLAdapter implements IDataSourceAdapter {
  readonly type = 'mysql' as const;
  readonly config: ConnectionConfig;
  private pool: any = null;
  private _connected = false;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  private async getPool() {
    if (!this.pool) {
      const mysql = await getMySQL();
      this.pool = mysql.createPool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        ssl: this.config.ssl ? { rejectUnauthorized: false } : undefined,
        connectionLimit: 5,
        connectTimeout: 10000,
      });
    }
    return this.pool;
  }

  async connect(): Promise<void> {
    const pool = await this.getPool();
    const conn = await pool.getConnection();
    conn.release();
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
      const conn = await pool.getConnection();
      await conn.query('SELECT 1');
      conn.release();
      this._connected = true;
      return {
        success: true,
        message: `MySQL'e basariyla baglandi (${this.config.host}:${this.config.port}/${this.config.database})`,
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
    const [rows] = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = DATABASE()
         AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );

    return (rows as any[]).map((row: any) => ({
      name: row.TABLE_NAME || row.table_name,
      displayName: (row.TABLE_NAME || row.table_name).replace(/_/g, ' '),
    }));
  }

  async getFields(tableName: string): Promise<FieldInfo[]> {
    const pool = await this.getPool();
    const [rows] = await pool.query(
      `SELECT
        COLUMN_NAME as column_name,
        DATA_TYPE as data_type,
        IS_NULLABLE as is_nullable,
        COLUMN_KEY as column_key,
        EXTRA as extra
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?
       ORDER BY ORDINAL_POSITION`,
      [tableName]
    );

    // Foreign keys
    const [fkRows] = await pool.query(
      `SELECT
        COLUMN_NAME as column_name,
        REFERENCED_TABLE_NAME as foreign_table,
        REFERENCED_COLUMN_NAME as foreign_column
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [tableName]
    );

    const fkMap = new Map<string, { table: string; column: string }>();
    for (const fk of fkRows as any[]) {
      fkMap.set(fk.column_name, { table: fk.foreign_table, column: fk.foreign_column });
    }

    return (rows as any[]).map((col: any) => ({
      name: col.column_name,
      type: col.data_type,
      displayName: col.column_name.replace(/_/g, ' '),
      required: col.is_nullable === 'NO',
      primaryKey: col.column_key === 'PRI',
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
    const { whereClause, params } = translateFilters(filters, 'question');

    const selectFields = fields.length > 0
      ? fields.map(f => `\`${f}\``).join(', ')
      : '*';

    const orderBy = translateOrder(order);

    let query = `SELECT ${selectFields} FROM \`${table}\``;
    if (whereClause) query += ` WHERE ${whereClause}`;
    if (orderBy) query += ` ORDER BY ${orderBy}`;
    query += ` LIMIT ${limit}`;

    const [rows] = await pool.query(query, params);
    return rows as any[];
  }

  async count(table: string, filters: any[] = []): Promise<number> {
    const pool = await this.getPool();
    const { whereClause, params } = translateFilters(filters, 'question');

    let query = `SELECT COUNT(*) as count FROM \`${table}\``;
    if (whereClause) query += ` WHERE ${whereClause}`;

    const [rows] = await pool.query(query, params);
    return (rows as any[])[0].count;
  }

  async create(table: string, values: Record<string, any>): Promise<number> {
    const pool = await this.getPool();
    const keys = Object.keys(values);
    const cols = keys.map(k => `\`${k}\``).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const vals = Object.values(values);

    const [result] = await pool.query(
      `INSERT INTO \`${table}\` (${cols}) VALUES (${placeholders})`,
      vals
    );
    return result.insertId;
  }

  async update(
    table: string,
    ids: number[],
    values: Record<string, any>
  ): Promise<boolean> {
    const pool = await this.getPool();
    const keys = Object.keys(values);
    const setClauses = keys.map(k => `\`${k}\` = ?`).join(', ');
    const vals = [...Object.values(values), ...ids];

    const idPlaceholders = ids.map(() => '?').join(', ');

    await pool.query(
      `UPDATE \`${table}\` SET ${setClauses} WHERE id IN (${idPlaceholders})`,
      vals
    );
    return true;
  }
}
