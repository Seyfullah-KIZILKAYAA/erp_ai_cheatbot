/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FIELD MAPPING SYSTEM
 * Maps semantic field concepts to actual field names in the connected database.
 * Supports auto-detection from schema and Odoo defaults for backward compatibility.
 *
 * Each entity (salesOrders, customers, etc.) has a set of semantic fields
 * (e.g., "customer", "totalAmount") that map to actual column/field names.
 */

export interface EntityFieldMap {
  [semanticField: string]: string;
}

export interface AllFieldMappings {
  salesOrders: EntityFieldMap;
  customers: EntityFieldMap;
  products: EntityFieldMap;
  invoices: EntityFieldMap;
  payments: EntityFieldMap;
  purchaseOrders: EntityFieldMap;
  employees: EntityFieldMap;
  crmLeads: EntityFieldMap;
  stockMoves: EntityFieldMap;
  stockQuants: EntityFieldMap;
  departments: EntityFieldMap;
}

// Odoo defaults (preserves current behavior)
const ODOO_FIELD_DEFAULTS: AllFieldMappings = {
  salesOrders: {
    id: 'id', name: 'name', customer: 'partner_id', totalAmount: 'amount_total',
    status: 'state', date: 'date_order'
  },
  customers: {
    id: 'id', name: 'name', email: 'email', phone: 'phone',
    city: 'city', isCompany: 'is_company'
  },
  products: {
    id: 'id', name: 'name', quantity: 'qty_available',
    price: 'list_price', code: 'default_code'
  },
  invoices: {
    id: 'id', name: 'name', customer: 'partner_id', totalAmount: 'amount_total',
    paymentStatus: 'payment_state', status: 'state', date: 'invoice_date'
  },
  payments: {
    id: 'id', name: 'name', customer: 'partner_id', amount: 'amount',
    type: 'payment_type', date: 'date', status: 'state'
  },
  purchaseOrders: {
    id: 'id', name: 'name', vendor: 'partner_id', totalAmount: 'amount_total',
    status: 'state', date: 'date_order'
  },
  employees: {
    id: 'id', name: 'name', email: 'work_email', phone: 'mobile_phone',
    department: 'department_id', jobTitle: 'job_title'
  },
  crmLeads: {
    id: 'id', name: 'name', customer: 'partner_id', stage: 'stage_id',
    probability: 'probability', expectedRevenue: 'expected_revenue'
  },
  stockMoves: {
    id: 'id', product: 'product_id', date: 'date', quantity: 'quantity',
    status: 'state', source: 'location_id', destination: 'location_dest_id'
  },
  stockQuants: {
    id: 'id', product: 'product_id', location: 'location_id',
    quantity: 'quantity', reserved: 'reserved_quantity'
  },
  departments: {
    id: 'id', name: 'name'
  }
};

// Auto-detection patterns: semantic concept -> candidate field names (ordered by priority)
const FIELD_PATTERNS: Record<string, Record<string, string[]>> = {
  salesOrders: {
    id: ['id', 'order_id', 'sale_id'],
    name: ['name', 'order_number', 'order_no', 'reference', 'ref', 'so_number'],
    customer: ['partner_id', 'customer_id', 'customer', 'client_id', 'client', 'buyer_id', 'customer_name'],
    totalAmount: ['amount_total', 'total_amount', 'total', 'grand_total', 'order_total', 'amount'],
    status: ['state', 'status', 'order_status', 'order_state'],
    date: ['date_order', 'order_date', 'created_at', 'date_created', 'created_date', 'date']
  },
  customers: {
    id: ['id', 'partner_id', 'customer_id'],
    name: ['name', 'customer_name', 'partner_name', 'display_name', 'full_name', 'company_name'],
    email: ['email', 'work_email', 'contact_email', 'email_address'],
    phone: ['phone', 'mobile_phone', 'telephone', 'phone_number', 'mobile', 'contact_phone'],
    city: ['city', 'town', 'location'],
    isCompany: ['is_company', 'company', 'is_organization', 'type']
  },
  products: {
    id: ['id', 'product_id'],
    name: ['name', 'product_name', 'display_name', 'title', 'description'],
    quantity: ['qty_available', 'quantity', 'stock_quantity', 'qty', 'stock', 'available_qty', 'on_hand'],
    price: ['list_price', 'price', 'unit_price', 'sale_price', 'selling_price', 'cost'],
    code: ['default_code', 'product_code', 'sku', 'code', 'barcode', 'internal_reference']
  },
  invoices: {
    id: ['id', 'invoice_id', 'move_id'],
    name: ['name', 'invoice_number', 'invoice_no', 'reference', 'number'],
    customer: ['partner_id', 'customer_id', 'customer', 'client_id', 'billing_customer'],
    totalAmount: ['amount_total', 'total_amount', 'total', 'amount', 'invoice_total', 'grand_total'],
    paymentStatus: ['payment_state', 'payment_status', 'pay_status', 'paid_status'],
    status: ['state', 'status', 'invoice_status'],
    date: ['invoice_date', 'date', 'date_invoice', 'created_at', 'issue_date']
  },
  payments: {
    id: ['id', 'payment_id'],
    name: ['name', 'payment_number', 'payment_ref', 'reference'],
    customer: ['partner_id', 'customer_id', 'payer_id', 'customer'],
    amount: ['amount', 'payment_amount', 'total', 'amount_paid'],
    type: ['payment_type', 'type', 'direction', 'payment_kind'],
    date: ['date', 'payment_date', 'created_at', 'transaction_date'],
    status: ['state', 'status', 'payment_status']
  },
  purchaseOrders: {
    id: ['id', 'purchase_id', 'po_id'],
    name: ['name', 'order_number', 'po_number', 'reference'],
    vendor: ['partner_id', 'vendor_id', 'supplier_id', 'vendor', 'supplier'],
    totalAmount: ['amount_total', 'total_amount', 'total', 'grand_total'],
    status: ['state', 'status', 'order_status'],
    date: ['date_order', 'order_date', 'created_at', 'date', 'purchase_date']
  },
  employees: {
    id: ['id', 'employee_id'],
    name: ['name', 'employee_name', 'full_name', 'display_name'],
    email: ['work_email', 'email', 'email_address', 'contact_email'],
    phone: ['mobile_phone', 'phone', 'mobile', 'phone_number', 'work_phone'],
    department: ['department_id', 'department', 'dept_id', 'department_name', 'dept'],
    jobTitle: ['job_title', 'position', 'title', 'role', 'job_position', 'designation']
  },
  crmLeads: {
    id: ['id', 'lead_id', 'opportunity_id'],
    name: ['name', 'lead_name', 'opportunity_name', 'title', 'subject'],
    customer: ['partner_id', 'customer_id', 'contact_id', 'customer', 'company'],
    stage: ['stage_id', 'stage', 'pipeline_stage', 'status', 'phase'],
    probability: ['probability', 'win_probability', 'chance', 'likelihood'],
    expectedRevenue: ['expected_revenue', 'revenue', 'expected_amount', 'deal_value', 'amount', 'value']
  },
  stockMoves: {
    id: ['id', 'move_id'],
    product: ['product_id', 'product', 'item_id', 'item'],
    date: ['date', 'move_date', 'created_at', 'transaction_date'],
    quantity: ['quantity', 'qty', 'amount', 'qty_done', 'product_qty'],
    status: ['state', 'status', 'move_state'],
    source: ['location_id', 'source_location', 'from_location', 'source'],
    destination: ['location_dest_id', 'destination_location', 'to_location', 'destination', 'dest_location']
  },
  stockQuants: {
    id: ['id', 'quant_id'],
    product: ['product_id', 'product', 'item_id'],
    location: ['location_id', 'location', 'warehouse'],
    quantity: ['quantity', 'qty', 'on_hand_qty', 'available_qty'],
    reserved: ['reserved_quantity', 'reserved_qty', 'reserved', 'allocated_qty']
  },
  departments: {
    id: ['id', 'department_id', 'dept_id'],
    name: ['name', 'department_name', 'dept_name', 'title']
  }
};

// In-memory field mapping store
let currentFieldMapping: AllFieldMappings = JSON.parse(JSON.stringify(ODOO_FIELD_DEFAULTS));

/**
 * Auto-detect field mapping from actual field names in the database.
 */
export function autoDetectFieldMapping(
  entity: keyof AllFieldMappings,
  availableFields: string[]
): EntityFieldMap {
  const patterns = FIELD_PATTERNS[entity];
  if (!patterns) return ODOO_FIELD_DEFAULTS[entity] || {};

  const mapping: EntityFieldMap = {};
  const lowerFields = availableFields.map(f => f.toLowerCase());

  for (const [semantic, candidates] of Object.entries(patterns)) {
    let found = false;
    for (const candidate of candidates) {
      const idx = lowerFields.indexOf(candidate.toLowerCase());
      if (idx >= 0) {
        mapping[semantic] = availableFields[idx]; // preserve original casing
        found = true;
        break;
      }
    }
    // If no exact match, try partial match
    if (!found) {
      for (const candidate of candidates) {
        const idx = lowerFields.findIndex(f => f.includes(candidate.toLowerCase()));
        if (idx >= 0) {
          mapping[semantic] = availableFields[idx];
          break;
        }
      }
    }
  }

  return mapping;
}

/**
 * Auto-detect and save field mappings for all entities.
 */
export function autoDetectAllFieldMappings(
  entityFields: Record<string, string[]>
): AllFieldMappings {
  const mapping = JSON.parse(JSON.stringify(ODOO_FIELD_DEFAULTS)) as AllFieldMappings;

  for (const [entity, fields] of Object.entries(entityFields)) {
    if (entity in mapping) {
      const detected = autoDetectFieldMapping(entity as keyof AllFieldMappings, fields);
      if (Object.keys(detected).length > 0) {
        (mapping as any)[entity] = { ...(mapping as any)[entity], ...detected };
      }
    }
  }

  currentFieldMapping = mapping;
  return mapping;
}

/**
 * Get field mapping for a specific entity.
 */
export function getFieldMapping(entity: keyof AllFieldMappings): EntityFieldMap {
  return currentFieldMapping[entity] || {};
}

/**
 * Get all current field mappings.
 */
export function getAllFieldMappings(): AllFieldMappings {
  return currentFieldMapping;
}

/**
 * Resolve a semantic field to the actual field name.
 * Returns the actual field name or undefined if not mapped.
 */
export function resolveField(entity: keyof AllFieldMappings, semanticField: string): string | undefined {
  const mapping = currentFieldMapping[entity];
  return mapping?.[semanticField];
}

/**
 * Get an array of actual field names for an entity based on semantic field list.
 * Used by agents to build their field arrays dynamically.
 */
export function resolveFields(entity: keyof AllFieldMappings, semanticFields: string[]): string[] {
  const mapping = currentFieldMapping[entity];
  if (!mapping) return [];
  return semanticFields
    .map(sf => mapping[sf])
    .filter((f): f is string => !!f);
}

/**
 * Set field mapping for a specific entity.
 */
export function setFieldMapping(entity: keyof AllFieldMappings, mapping: EntityFieldMap): void {
  currentFieldMapping[entity] = mapping;
}

/**
 * Reset to Odoo defaults.
 */
export function resetFieldMappings(): void {
  currentFieldMapping = JSON.parse(JSON.stringify(ODOO_FIELD_DEFAULTS));
}

/**
 * Set the full field mapping (used when loading from schema discovery).
 */
export function setAllFieldMappings(mapping: AllFieldMappings): void {
  currentFieldMapping = mapping;
}
