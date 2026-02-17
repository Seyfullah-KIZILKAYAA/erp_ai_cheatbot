/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CONNECTION STORE
 * Server-side persistent storage for connection configurations.
 * Stores encrypted credentials in data/connections.json.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { SavedConnection } from '@/lib/types/connection';

const STORE_PATH = path.join(process.cwd(), 'data', 'connections.json');
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const key = process.env.CONNECTION_ENCRYPTION_KEY || 'erp-cheatbot-default-key-32chr!';
  // Ensure 32 bytes for AES-256
  return crypto.createHash('sha256').update(key).digest();
}

export function encryptPassword(password: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptPassword(encryptedStr: string): string {
  const key = getEncryptionKey();
  const parts = encryptedStr.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted format');

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function ensureDataDir(): Promise<void> {
  const dir = path.dirname(STORE_PATH);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function saveConnection(conn: SavedConnection): Promise<void> {
  await ensureDataDir();
  const data = JSON.stringify(conn, null, 2);
  await fs.writeFile(STORE_PATH, data, 'utf8');
}

export async function getConnection(): Promise<SavedConnection | null> {
  try {
    await fs.access(STORE_PATH);
    const data = await fs.readFile(STORE_PATH, 'utf8');
    return JSON.parse(data) as SavedConnection;
  } catch {
    return null;
  }
}

export async function deleteConnection(): Promise<void> {
  try {
    await fs.unlink(STORE_PATH);
  } catch {
    // File doesn't exist, that's fine
  }
}

/**
 * Build a ConnectionConfig from a SavedConnection (decrypting password).
 */
export function toConnectionConfig(saved: SavedConnection): any {
  return {
    type: saved.type,
    label: saved.label,
    host: saved.host,
    port: saved.port,
    database: saved.database,
    username: saved.username,
    password: decryptPassword(saved.encryptedPassword),
    protocol: saved.protocol,
    ssl: saved.ssl,
    filepath: saved.filepath,
  };
}
