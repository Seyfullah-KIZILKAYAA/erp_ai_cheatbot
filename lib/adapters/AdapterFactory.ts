/**
 * ADAPTER FACTORY
 * Creates the appropriate data source adapter based on connection type.
 */

import { ConnectionConfig, IDataSourceAdapter } from './IDataSourceAdapter';
import { OdooAdapter } from './OdooAdapter';
import { PostgreSQLAdapter } from './PostgreSQLAdapter';
import { MySQLAdapter } from './MySQLAdapter';
import { MSSQLAdapter } from './MSSQLAdapter';
import { SQLiteAdapter } from './SQLiteAdapter';

export function createAdapter(config: ConnectionConfig): IDataSourceAdapter {
  switch (config.type) {
    case 'odoo':
      return new OdooAdapter(config);
    case 'postgresql':
      return new PostgreSQLAdapter(config);
    case 'mysql':
      return new MySQLAdapter(config);
    case 'mssql':
      return new MSSQLAdapter(config);
    case 'sqlite':
      return new SQLiteAdapter(config);
    default:
      throw new Error(`Desteklenmeyen baglanti tipi: ${(config as any).type}`);
  }
}
