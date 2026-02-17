/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TABLE MAPPING SYSTEM
 * Maps semantic ERP concepts to actual table/model names in the connected database.
 * Supports auto-detection from discovered schema and manual overrides.
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

// Default Odoo mapping (preserves current behavior)
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

// In-memory mapping store (server-side)
let currentMapping: TableMapping = { ...ODOO_DEFAULTS };

/**
 * Auto-detect table mapping from discovered table names.
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

  mapping.salesOrders = findTable(['sale.order', 'sale_order', 'sales_order', 'orders', 'sales']);
  mapping.customers = findTable(['res.partner', 'customer', 'customers', 'partner', 'partners', 'client', 'clients']);
  mapping.products = findTable(['product.product', 'product', 'products', 'item', 'items']);
  mapping.invoices = findTable(['account.move', 'account_move', 'invoice', 'invoices']);
  mapping.payments = findTable(['account.payment', 'account_payment', 'payment', 'payments']);
  mapping.purchaseOrders = findTable(['purchase.order', 'purchase_order', 'purchase_orders', 'purchases']);
  mapping.employees = findTable(['hr.employee', 'hr_employee', 'employee', 'employees', 'staff']);
  mapping.crmLeads = findTable(['crm.lead', 'crm_lead', 'lead', 'leads', 'opportunity', 'opportunities']);
  mapping.stockMoves = findTable(['stock.move', 'stock_move', 'stock_moves', 'inventory_move']);
  mapping.stockQuants = findTable(['stock.quant', 'stock_quant', 'stock_quants', 'inventory']);
  mapping.departments = findTable(['hr.department', 'hr_department', 'department', 'departments']);
  mapping.companies = findTable(['res.company', 'res_company', 'company', 'companies']);
  mapping.crmStages = findTable(['crm.stage', 'crm_stage', 'pipeline_stage', 'stages']);

  return mapping;
}

/**
 * Auto-detect mapping and save it.
 */
export async function autoDetectAndSaveMapping(tableNames: string[]): Promise<TableMapping> {
  const detected = autoDetectMapping(tableNames);
  // Merge with defaults (detected values override defaults, skip undefined)
  const merged = { ...ODOO_DEFAULTS };
  for (const [key, value] of Object.entries(detected)) {
    if (value) {
      (merged as any)[key] = value;
    }
  }
  currentMapping = merged;
  return merged;
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
  return currentMapping;
}

/**
 * Set the full mapping (used when loading from saved config).
 */
export function setTableMapping(mapping: TableMapping): void {
  currentMapping = mapping;
}
