/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SQLITE ADAPTER
 * Implements IDataSourceAdapter for SQLite databases.
 */

import {
  IDataSourceAdapter,
  ConnectionConfig,
  TableInfo,
  FieldInfo,
  TestConnectionResult,
} from './IDataSourceAdapter';
import { translateFilters, translateOrder } from './filterTranslator';

let BetterSqlite3: any = null;

async function getSqlite() {
  if (!BetterSqlite3) {
    BetterSqlite3 = (await import('better-sqlite3')).default;
  }
  return BetterSqlite3;
}

export class SQLiteAdapter implements IDataSourceAdapter {
  readonly type = 'sqlite' as const;
  readonly config: ConnectionConfig;
  private db: any = null;
  private _connected = false;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  private async getDb() {
    if (!this.db) {
      const Database = await getSqlite();
      const filepath = this.config.filepath || this.config.database;
      this.db = new Database(filepath);
      this.db.pragma('journal_mode = WAL');
    }
    return this.db;
  }

  async connect(): Promise<void> {
    await this.getDb();
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this._connected = false;
  }

  async testConnection(): Promise<TestConnectionResult> {
    const start = Date.now();
    try {
      const db = await this.getDb();
      db.prepare('SELECT 1').get();
      this._connected = true;
      return {
        success: true,
        message: `SQLite'a basariyla baglandi (${this.config.filepath || this.config.database})`,
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
    const db = await this.getDb();
    const rows = db.prepare(
      `SELECT name FROM sqlite_master
       WHERE type='table' AND name NOT LIKE 'sqlite_%'
       ORDER BY name`
    ).all();

    return rows.map((row: any) => ({
      name: row.name,
      displayName: row.name.replace(/_/g, ' '),
    }));
  }

  async getFields(tableName: string): Promise<FieldInfo[]> {
    const db = await this.getDb();
    const rows = db.prepare(`PRAGMA table_info("${tableName}")`).all();

    // Foreign keys
    const fkRows = db.prepare(`PRAGMA foreign_key_list("${tableName}")`).all();
    const fkMap = new Map<string, { table: string; column: string }>();
    for (const fk of fkRows) {
      fkMap.set(fk.from, { table: fk.table, column: fk.to });
    }

    return rows.map((col: any) => ({
      name: col.name,
      type: col.type || 'TEXT',
      displayName: col.name.replace(/_/g, ' '),
      required: col.notnull === 1,
      primaryKey: col.pk === 1,
      foreignKey: fkMap.get(col.name),
    }));
  }

  async search(
    table: string,
    filters: any[] = [],
    fields: string[] = [],
    limit: number = 10,
    order: string = ''
  ): Promise<any[]> {
    const db = await this.getDb();
    const { whereClause, params } = translateFilters(filters, 'question');

    const selectFields = fields.length > 0
      ? fields.map(f => `"${f}"`).join(', ')
      : '*';

    const orderBy = translateOrder(order);

    let query = `SELECT ${selectFields} FROM "${table}"`;
    if (whereClause) query += ` WHERE ${whereClause}`;
    if (orderBy) query += ` ORDER BY ${orderBy}`;
    query += ` LIMIT ${limit}`;

    return db.prepare(query).all(...params);
  }

  async count(table: string, filters: any[] = []): Promise<number> {
    const db = await this.getDb();
    const { whereClause, params } = translateFilters(filters, 'question');

    let query = `SELECT COUNT(*) as count FROM "${table}"`;
    if (whereClause) query += ` WHERE ${whereClause}`;

    const result = db.prepare(query).get(...params);
    return result.count;
  }

  async create(table: string, values: Record<string, any>): Promise<number> {
    const db = await this.getDb();
    const keys = Object.keys(values);
    const cols = keys.map(k => `"${k}"`).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const vals = Object.values(values);

    const result = db.prepare(
      `INSERT INTO "${table}" (${cols}) VALUES (${placeholders})`
    ).run(...vals);

    return result.lastInsertRowid;
  }

  async update(
    table: string,
    ids: number[],
    values: Record<string, any>
  ): Promise<boolean> {
    const db = await this.getDb();
    const keys = Object.keys(values);
    const setClauses = keys.map(k => `"${k}" = ?`).join(', ');
    const idPlaceholders = ids.map(() => '?').join(', ');
    const vals = [...Object.values(values), ...ids];

    db.prepare(
      `UPDATE "${table}" SET ${setClauses} WHERE id IN (${idPlaceholders})`
    ).run(...vals);

    return true;
  }
}
