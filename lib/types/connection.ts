/**
 * CONNECTION TYPES
 * Types for saved connection configurations
 */

import { ConnectionType } from '../adapters/IDataSourceAdapter';

export interface SavedConnection {
  id: string;
  type: ConnectionType;
  label: string;
  host: string;
  port: number;
  database: string;
  username: string;
  encryptedPassword: string;
  protocol?: 'http' | 'https';
  ssl?: boolean;
  filepath?: string;
  rememberCredentials: boolean;
  savedAt: string;
}

export interface ConnectionStatus {
  configured: boolean;
  connected: boolean;
  type?: ConnectionType;
  label?: string;
  host?: string;
  database?: string;
  tableCount?: number;
}

export const CONNECTION_DISPLAY_NAMES: Record<ConnectionType, string> = {
  odoo: 'Odoo ERP',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mssql: 'SQL Server',
  sqlite: 'SQLite',
};

export const CONNECTION_DEFAULT_PORTS: Record<ConnectionType, number> = {
  odoo: 8069,
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
  sqlite: 0,
};
