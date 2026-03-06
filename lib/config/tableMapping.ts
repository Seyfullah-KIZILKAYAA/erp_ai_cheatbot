/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TABLE MAPPING SYSTEM
 * Maps semantic ERP concepts to actual table/model names in the connected database.
 * Supports auto-detection from discovered schema, LLM-based mapping, and manual overrides.
 *
 * When connected to a non-Odoo database, unmapped entities use empty string ('')
 * instead of falling back to Odoo defaults. Agents check for empty mappings
 * and return user-friendly error messages.
 */

export interface TableMapping {
  salesOrders: string;
  customers: string;
  products: string;
  invoices: string;
  payments: string;
  purchaseOrders: string;
  employees: string;
  crmLeads: string;
  stockMoves: string;
  stockQuants: string;
  departments: string;
  companies: string;
  crmStages: string;
}

// Default Odoo mapping (used only for Odoo connections)
const ODOO_DEFAULTS: TableMapping = {
  salesOrders: 'sale.order',
  customers: 'res.partner',
  products: 'product.product',
  invoices: 'account.move',
  payments: 'account.payment',
  purchaseOrders: 'purchase.order',
  employees: 'hr.employee',
  crmLeads: 'crm.lead',
  stockMoves: 'stock.move',
  stockQuants: 'stock.quant',
  departments: 'hr.department',
  companies: 'res.company',
  crmStages: 'crm.stage',
};

// Empty mapping (no table assigned)
export const EMPTY_MAPPING: TableMapping = {
  salesOrders: '',
  customers: '',
  products: '',
  invoices: '',
  payments: '',
  purchaseOrders: '',
  employees: '',
  crmLeads: '',
  stockMoves: '',
  stockQuants: '',
  departments: '',
  companies: '',
  crmStages: '',
};

// In-memory mapping store (server-side)
let currentMapping: TableMapping = { ...ODOO_DEFAULTS };
let isOdooMode = true;

/**
 * All semantic entity keys.
 */
export const ALL_ENTITY_KEYS = Object.keys(EMPTY_MAPPING) as (keyof TableMapping)[];

/**
 * Auto-detect table mapping from discovered table names using pattern matching.
 */
export function autoDetectMapping(tableNames: string[]): Partial<TableMapping> {
  const mapping: Partial<TableMapping> = {};
  const lower = tableNames.map(t => t.toLowerCase());

  const findTable = (patterns: string[]): string | undefined => {
    for (const p of patterns) {
      // Exact match first
      const exactIdx = lower.indexOf(p.toLowerCase());
      if (exactIdx >= 0) return tableNames[exactIdx];
      // Then partial match
      const partialIdx = lower.findIndex(t => t.includes(p.toLowerCase()));
      if (partialIdx >= 0) return tableNames[partialIdx];
    }
    return undefined;
  };

  mapping.salesOrders = findTable(['sale.order', 'sale_order', 'sales_order', 'orders', 'sales', 'Siparisler', 'siparis', 'siparisler']);
  mapping.customers = findTable(['res.partner', 'customer', 'customers', 'partner', 'partners', 'client', 'clients', 'Musteriler', 'musteri', 'musteriler']);
  mapping.products = findTable(['product.product', 'product', 'products', 'item', 'items', 'Urunler', 'urun', 'urunler']);
  mapping.invoices = findTable(['account.move', 'account_move', 'invoice', 'invoices', 'Faturalar', 'fatura', 'faturalar']);
  mapping.payments = findTable(['account.payment', 'account_payment', 'payment', 'payments', 'Odemeler', 'odeme', 'odemeler']);
  mapping.purchaseOrders = findTable(['purchase.order', 'purchase_order', 'purchase_orders', 'purchases', 'SatinAlma', 'satin_alma']);
  mapping.employees = findTable(['hr.employee', 'hr_employee', 'employee', 'employees', 'staff', 'Calisanlar', 'calisan', 'calisanlar', 'Personel', 'personel']);
  mapping.crmLeads = findTable(['crm.lead', 'crm_lead', 'lead', 'leads', 'opportunity', 'opportunities', 'Firsatlar', 'firsat']);
  mapping.stockMoves = findTable(['stock.move', 'stock_move', 'stock_moves', 'inventory_move', 'StokHareketleri', 'stok_hareket']);
  mapping.stockQuants = findTable(['stock.quant', 'stock_quant', 'stock_quants', 'inventory', 'Stok', 'stok']);
  mapping.departments = findTable(['hr.department', 'hr_department', 'department', 'departments', 'Departmanlar', 'departman']);
  mapping.companies = findTable(['res.company', 'res_company', 'company', 'companies', 'Sirketler', 'sirket']);
  mapping.crmStages = findTable(['crm.stage', 'crm_stage', 'pipeline_stage', 'stages']);

  // Also try to map related tables
  if (!mapping.purchaseOrders) mapping.purchaseOrders = findTable(['Tedarikciler', 'tedarikci', 'tedarikciler']);
  if (!mapping.stockMoves) mapping.stockMoves = findTable(['SiparisDetay', 'siparis_detay']);

  return mapping;
}

/**
 * Auto-detect mapping and save it.
 * For Odoo connections: unmapped entities fall back to Odoo defaults.
 * For non-Odoo connections: unmapped entities stay empty (no fallback).
 */
export async function autoDetectAndSaveMapping(tableNames: string[], connectionType?: string): Promise<TableMapping> {
  const detected = autoDetectMapping(tableNames);

  isOdooMode = connectionType === 'odoo';

  // For Odoo: merge with Odoo defaults. For others: only use detected values.
  const base = isOdooMode ? { ...ODOO_DEFAULTS } : { ...EMPTY_MAPPING };

  for (const [key, value] of Object.entries(detected)) {
    if (value) {
      (base as any)[key] = value;
    }
  }

  currentMapping = base;
  return currentMapping;
}

/**
 * Get the list of entities that are not yet mapped to any table.
 */
export function getUnmappedEntities(): string[] {
  return ALL_ENTITY_KEYS.filter(key => !currentMapping[key]);
}

/**
 * Check if a specific entity has a valid table mapping.
 */
export function isEntityMapped(entity: keyof TableMapping): boolean {
  return !!currentMapping[entity];
}

/**
 * Apply LLM-detected mapping on top of existing mapping.
 * Only fills in unmapped entities — never overwrites existing mappings.
 */
export function applyLLMMapping(llmMapping: Partial<TableMapping>): TableMapping {
  for (const [key, value] of Object.entries(llmMapping)) {
    if (value && !(currentMapping as any)[key]) {
      (currentMapping as any)[key] = value;
    }
  }
  console.log(`🗺️ [TABLE MAPPING] After LLM merge, unmapped: [${getUnmappedEntities().join(', ')}]`);
  return currentMapping;
}

/**
 * Apply LLM mapping as the PRIMARY source of truth.
 * OVERWRITES existing mappings (unlike applyLLMMapping which only fills gaps).
 * Used for non-Odoo connections where LLM is the primary mapper.
 */
export function applyLLMFullMapping(llmMapping: Partial<TableMapping>): TableMapping {
  const base = { ...EMPTY_MAPPING };
  for (const [key, value] of Object.entries(llmMapping)) {
    if (value && typeof value === 'string') {
      (base as any)[key] = value;
    }
  }
  currentMapping = base;
  isOdooMode = false;
  return currentMapping;
}

/**
 * Get the current table mapping.
 */
export function getTableMapping(): TableMapping {
  return currentMapping;
}

/**
 * Update a specific mapping entry.
 */
export function updateTableMapping(updates: Partial<TableMapping>): TableMapping {
  currentMapping = { ...currentMapping, ...updates };
  return currentMapping;
}

/**
 * Reset to Odoo defaults.
 */
export function resetToOdooDefaults(): TableMapping {
  currentMapping = { ...ODOO_DEFAULTS };
  isOdooMode = true;
  return currentMapping;
}

/**
 * Set the full mapping (used when loading from saved config).
 */
export function setTableMapping(mapping: TableMapping): void {
  currentMapping = mapping;
}
