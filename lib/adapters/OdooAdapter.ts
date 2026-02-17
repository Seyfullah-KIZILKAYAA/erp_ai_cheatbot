/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOO ADAPTER
 * Implements IDataSourceAdapter for Odoo ERP via XML-RPC.
 * Wraps the existing odooClient.ts functionality.
 */

import xmlrpc from 'xmlrpc';
import { withTimeout } from '@/lib/utils/errorHandling';
import {
  IDataSourceAdapter,
  ConnectionConfig,
  TableInfo,
  FieldInfo,
  TestConnectionResult,
} from './IDataSourceAdapter';

export class OdooAdapter implements IDataSourceAdapter {
  readonly type = 'odoo' as const;
  readonly config: ConnectionConfig;
  private uid: number | null = null;
  private _connected = false;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  private getClient(path: string) {
    const protocol = this.config.protocol || 'http';
    const url = `${protocol}://${this.config.host}:${this.config.port}`;
    const parsed = new URL(url);
    const createClient = parsed.protocol === 'https:' ? xmlrpc.createSecureClient : xmlrpc.createClient;

    return createClient({
      host: parsed.hostname,
      port: parseInt(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80),
      path: path,
    });
  }

  private async authenticate(): Promise<number> {
    if (this.uid) return this.uid;

    return new Promise((resolve, reject) => {
      const client = this.getClient('/xmlrpc/2/common');
      client.methodCall(
        'authenticate',
        [this.config.database, this.config.username, this.config.password, {}],
        (error, value) => {
          if (error) reject(error);
          else if (!value) reject(new Error('Authentication failed. Check credentials.'));
          else {
            this.uid = value as number;
            resolve(value as number);
          }
        }
      );
    });
  }

  async connect(): Promise<void> {
    await this.authenticate();
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    this.uid = null;
    this._connected = false;
  }

  async testConnection(): Promise<TestConnectionResult> {
    const start = Date.now();
    try {
      await withTimeout(
        () => this.authenticate(),
        10000,
        'Odoo connection test timed out'
      );
      return {
        success: true,
        message: `Odoo'ya basariyla baglandi (UID: ${this.uid})`,
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
    return this._connected && this.uid !== null;
  }

  async getTables(): Promise<TableInfo[]> {
    const uid = await this.authenticate();
    const client = this.getClient('/xmlrpc/2/object');

    const models: any[] = await withTimeout(
      () =>
        new Promise((resolve, reject) => {
          client.methodCall(
            'execute_kw',
            [
              this.config.database,
              uid,
              this.config.password,
              'ir.model',
              'search_read',
              [[]],
              { fields: ['model', 'name'], limit: 500, order: 'model ASC' },
            ],
            (error, value) => {
              if (error) reject(error);
              else resolve(value);
            }
          );
        }),
      15000,
      'Schema discovery timed out'
    );

    return models.map((m: any) => ({
      name: m.model,
      displayName: m.name,
    }));
  }

  async getFields(tableName: string): Promise<FieldInfo[]> {
    const uid = await this.authenticate();
    const client = this.getClient('/xmlrpc/2/object');

    const fields: any[] = await withTimeout(
      () =>
        new Promise((resolve, reject) => {
          client.methodCall(
            'execute_kw',
            [
              this.config.database,
              uid,
              this.config.password,
              'ir.model.fields',
              'search_read',
              [[['model', '=', tableName]]],
              {
                fields: ['name', 'field_description', 'ttype', 'required', 'relation'],
                limit: 200,
              },
            ],
            (error, value) => {
              if (error) reject(error);
              else resolve(value);
            }
          );
        }),
      10000,
      'Field discovery timed out'
    );

    return fields.map((f: any) => ({
      name: f.name,
      type: f.ttype,
      displayName: f.field_description,
      required: f.required || false,
      primaryKey: f.name === 'id',
      foreignKey: f.relation
        ? { table: f.relation, column: 'id' }
        : undefined,
    }));
  }

  async search(
    table: string,
    filters: any[] = [],
    fields: string[] = [],
    limit: number = 10,
    order: string = ''
  ): Promise<any[]> {
    const uid = await this.authenticate();
    const client = this.getClient('/xmlrpc/2/object');

    return withTimeout(
      () =>
        new Promise((resolve, reject) => {
          const options: any = {
            fields: fields.length > 0 ? fields : undefined,
            limit: limit,
          };
          if (order) options.order = order;

          client.methodCall(
            'execute_kw',
            [this.config.database, uid, this.config.password, table, 'search_read', [filters], options],
            (error, value) => {
              if (error) reject(error);
              else resolve(value);
            }
          );
        }),
      10000,
      'Odoo search_read operation timed out'
    );
  }

  async count(table: string, filters: any[] = []): Promise<number> {
    const uid = await this.authenticate();
    const client = this.getClient('/xmlrpc/2/object');

    return withTimeout(
      () =>
        new Promise<number>((resolve, reject) => {
          client.methodCall(
            'execute_kw',
            [this.config.database, uid, this.config.password, table, 'search_count', [filters]],
            (error, value) => {
              if (error) reject(error);
              else resolve(value as number);
            }
          );
        }),
      10000,
      'Odoo search_count operation timed out'
    );
  }

  async create(table: string, values: Record<string, any>): Promise<number> {
    const uid = await this.authenticate();
    const client = this.getClient('/xmlrpc/2/object');

    return withTimeout(
      () =>
        new Promise<number>((resolve, reject) => {
          client.methodCall(
            'execute_kw',
            [this.config.database, uid, this.config.password, table, 'create', [values]],
            (error, value) => {
              if (error) reject(error);
              else resolve(value as number);
            }
          );
        }),
      10000,
      'Odoo create operation timed out'
    );
  }

  async update(
    table: string,
    ids: number[],
    values: Record<string, any>
  ): Promise<boolean> {
    const uid = await this.authenticate();
    const client = this.getClient('/xmlrpc/2/object');

    return withTimeout(
      () =>
        new Promise<boolean>((resolve, reject) => {
          client.methodCall(
            'execute_kw',
            [this.config.database, uid, this.config.password, table, 'write', [ids, values]],
            (error, value) => {
              if (error) reject(error);
              else resolve(value as boolean);
            }
          );
        }),
      10000,
      'Odoo write operation timed out'
    );
  }
}
