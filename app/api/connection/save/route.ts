/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { saveConnection, encryptPassword } from '@/lib/services/connectionStore';
import { setConnection, getSchemaCache } from '@/lib/adapters/ConnectionManager';
import { ConnectionConfig } from '@/lib/adapters/IDataSourceAdapter';
import { SavedConnection } from '@/lib/types/connection';

/**
 * POST /api/connection/save
 * Saves connection config, connects, and discovers schema.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const config: ConnectionConfig = {
      type: body.type,
      label: body.label || `${body.type} baglanti`,
      host: body.host || 'localhost',
      port: body.port || 5432,
      database: body.database || '',
      username: body.username || '',
      password: body.password || '',
      protocol: body.protocol,
      ssl: body.ssl || false,
      filepath: body.filepath,
    };

    // Connect via ConnectionManager
    await setConnection(config);

    // Discover schema
    const schema = await getSchemaCache();

    // Save to file if rememberCredentials is true
    if (body.rememberCredentials !== false) {
      const saved: SavedConnection = {
        id: `conn-${Date.now()}`,
        type: config.type,
        label: config.label,
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        encryptedPassword: encryptPassword(config.password),
        protocol: config.protocol,
        ssl: config.ssl,
        filepath: config.filepath,
        rememberCredentials: true,
        savedAt: new Date().toISOString(),
      };
      await saveConnection(saved);
    }

    return NextResponse.json({
      success: true,
      message: 'Baglanti basariyla kuruldu ve sema kesfedildi.',
      tableCount: schema.tables.length,
      tables: schema.tables.slice(0, 20).map(t => ({
        name: t.name,
        displayName: t.displayName,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
