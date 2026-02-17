/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { createAdapter } from '@/lib/adapters/AdapterFactory';
import { ConnectionConfig } from '@/lib/adapters/IDataSourceAdapter';

/**
 * POST /api/connection/test
 * Tests a connection without saving it.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const config: ConnectionConfig = {
      type: body.type,
      label: body.label || `${body.type} connection`,
      host: body.host || 'localhost',
      port: body.port || 5432,
      database: body.database || '',
      username: body.username || '',
      password: body.password || '',
      protocol: body.protocol,
      ssl: body.ssl || false,
      filepath: body.filepath,
    };

    const adapter = createAdapter(config);
    const result = await adapter.testConnection();

    // Clean up
    try { await adapter.disconnect(); } catch { /* ignore */ }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: `Test hatasi: ${error.message}`,
      latencyMs: 0,
    });
  }
}
