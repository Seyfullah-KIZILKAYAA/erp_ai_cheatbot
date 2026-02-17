/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { getSchemaCache, getTableFields, refreshSchema } from '@/lib/adapters/ConnectionManager';

/**
 * GET /api/schema?action=tables|fields&table=xxx|refresh
 * Returns schema information from the connected database.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'tables';
    const tableName = url.searchParams.get('table');

    if (action === 'refresh') {
      const schema = await refreshSchema();
      return NextResponse.json({
        success: true,
        tableCount: schema.tables.length,
        tables: schema.tables.map(t => ({
          name: t.name,
          displayName: t.displayName,
          schema: t.schema,
        })),
      });
    }

    if (action === 'fields' && tableName) {
      const fields = await getTableFields(tableName);
      return NextResponse.json({
        success: true,
        table: tableName,
        fields: fields.map((f: any) => ({
          name: f.name,
          type: f.type,
          displayName: f.displayName,
          required: f.required,
          primaryKey: f.primaryKey,
        })),
      });
    }

    // Default: return tables
    const schema = await getSchemaCache();
    return NextResponse.json({
      success: true,
      tableCount: schema.tables.length,
      tables: schema.tables.map(t => ({
        name: t.name,
        displayName: t.displayName,
        schema: t.schema,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
