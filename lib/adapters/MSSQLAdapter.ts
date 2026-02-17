/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * MSSQL ADAPTER
 * Implements IDataSourceAdapter for Microsoft SQL Server.
 */

import {
  IDataSourceAdapter,
  ConnectionConfig,
  TableInfo,
  FieldInfo,
  TestConnectionResult,
} from './IDataSourceAdapter';
import { translateFilters, translateOrder } from './filterTranslator';

let mssql: any = null;

async function getMssql() {
  if (!mssql) {
    mssql = await import('mssql');
  }
  return mssql;
}

export class MSSQLAdapter implements IDataSourceAdapter {
  readonly type = 'mssql' as const;
  readonly config: ConnectionConfig;
  private pool: any = null;
  private _connected = false;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  private getConnectionConfig() {
    return {
      server: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      options: {
        encrypt: this.config.ssl || false,
        trustServerCertificate: true,
        connectTimeout: 10000,
        requestTimeout: 10000,
      },
      pool: {
        max: 5,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };
  }

  private async getPool() {
    if (!this.pool) {
      const sql = await getMssql();
      this.pool = await new sql.ConnectionPool(this.getConnectionConfig()).connect();
    }
    return this.pool;
  }

  async connect(): Promise<void> {
    await this.getPool();
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
    this._connected = false;
  }

  async testConnection(): Promise<TestConnectionResult> {
    const start = Date.now();
    try {
      const pool = await this.getPool();
      await pool.request().query('SELECT 1');
      this._connected = true;
      return {
        success: true,
        message: `SQL Server'a basariyla baglandi (${this.config.host}:${this.config.port}/${this.config.database})`,
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
    const result = await pool.request().query(`
      SELECT TABLE_NAME, TABLE_SCHEMA
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `);

    return result.recordset.map((row: any) => ({
      name: row.TABLE_NAME,
      displayName: row.TABLE_NAME.replace(/_/g, ' '),
      schema: row.TABLE_SCHEMA,
    }));
  }

  async getFields(tableName: string): Promise<FieldInfo[]> {
    const pool = await this.getPool();

    const colResult = await pool.request()
      .input('tableName', tableName)
      .query(`
        SELECT
          c.COLUMN_NAME,
          c.DATA_TYPE,
          c.IS_NULLABLE,
          CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as IS_PK
        FROM INFORMATION_SCHEMA.COLUMNS c
        LEFT JOIN (
          SELECT ku.COLUMN_NAME
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
          JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
            ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
          WHERE tc.TABLE_NAME = @tableName AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        ) pk ON c.COLUMN_NAME = pk.COLUMN_NAME
        WHERE c.TABLE_NAME = @tableName
        ORDER BY c.ORDINAL_POSITION
      `);

    const fkResult = await pool.request()
      .input('tableName', tableName)
      .query(`
        SELECT
          COL_NAME(fkc.parent_object_id, fkc.parent_column_id) as column_name,
          OBJECT_NAME(fkc.referenced_object_id) as foreign_table,
          COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) as foreign_column
        FROM sys.foreign_key_columns fkc
        WHERE OBJECT_NAME(fkc.parent_object_id) = @tableName
      `);

    const fkMap = new Map<string, { table: string; column: string }>();
    for (const fk of fkResult.recordset) {
      fkMap.set(fk.column_name, { table: fk.foreign_table, column: fk.foreign_column });
    }

    return colResult.recordset.map((col: any) => ({
      name: col.COLUMN_NAME,
      type: col.DATA_TYPE,
      displayName: col.COLUMN_NAME.replace(/_/g, ' '),
      required: col.IS_NULLABLE === 'NO',
      primaryKey: col.IS_PK === 1,
      foreignKey: fkMap.get(col.COLUMN_NAME),
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
    const { whereClause, params } = translateFilters(filters, 'at');

    const selectFields = fields.length > 0
      ? fields.map(f => `[${f}]`).join(', ')
      : '*';

    const orderBy = translateOrder(order);

    let query = `SELECT TOP ${limit} ${selectFields} FROM [${table}]`;
    if (whereClause) query += ` WHERE ${whereClause}`;
    if (orderBy) query += ` ORDER BY ${orderBy}`;

    const request = pool.request();
    params.forEach((p, i) => request.input(`p${i + 1}`, p));

    const result = await request.query(query);
    return result.recordset;
  }

  async count(table: string, filters: any[] = []): Promise<number> {
    const pool = await this.getPool();
    const { whereClause, params } = translateFilters(filters, 'at');

    let query = `SELECT COUNT(*) as count FROM [${table}]`;
    if (whereClause) query += ` WHERE ${whereClause}`;

    const request = pool.request();
    params.forEach((p, i) => request.input(`p${i + 1}`, p));

    const result = await request.query(query);
    return result.recordset[0].count;
  }

  async create(table: string, values: Record<string, any>): Promise<number> {
    const pool = await this.getPool();
    const keys = Object.keys(values);
    const cols = keys.map(k => `[${k}]`).join(', ');
    const placeholders = keys.map((_, i) => `@p${i + 1}`).join(', ');

    const request = pool.request();
    Object.values(values).forEach((v, i) => request.input(`p${i + 1}`, v));

    const result = await request.query(
      `INSERT INTO [${table}] (${cols}) OUTPUT INSERTED.id VALUES (${placeholders})`
    );
    return result.recordset[0]?.id || 0;
  }

  async update(
    table: string,
    ids: number[],
    values: Record<string, any>
  ): Promise<boolean> {
    const pool = await this.getPool();
    const keys = Object.keys(values);
    let paramIdx = 1;

    const setClauses = keys.map(k => `[${k}] = @p${paramIdx++}`).join(', ');
    const idPlaceholders = ids.map(() => `@p${paramIdx++}`).join(', ');

    const request = pool.request();
    let idx = 1;
    Object.values(values).forEach(v => request.input(`p${idx++}`, v));
    ids.forEach(id => request.input(`p${idx++}`, id));

    await request.query(
      `UPDATE [${table}] SET ${setClauses} WHERE id IN (${idPlaceholders})`
    );
    return true;
  }
}
