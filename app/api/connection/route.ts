/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getConnection, deleteConnection } from '@/lib/services/connectionStore';
import { hasActiveConnection, getConnectionInfo, disconnect, getSchemaCache } from '@/lib/adapters/ConnectionManager';

/**
 * GET /api/connection
 * Returns current connection status and info.
 */
export async function GET() {
  try {
    const saved = await getConnection();
    const connected = hasActiveConnection();
    const info = getConnectionInfo();

    let tableCount = 0;
    if (connected) {
      try {
        const schema = await getSchemaCache();
        tableCount = schema.tables.length;
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      configured: saved !== null || connected,
      connected,
      type: info?.type || saved?.type || null,
      label: info?.label || saved?.label || null,
      host: info?.host || saved?.host || null,
      database: info?.database || saved?.database || null,
      tableCount,
    });
  } catch (error: any) {
    return NextResponse.json(
      { configured: false, connected: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/connection
 * Removes saved connection and disconnects.
 */
export async function DELETE() {
  try {
    await disconnect();
    await deleteConnection();
    return NextResponse.json({ success: true, message: 'Baglanti kaldirildi.' });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
