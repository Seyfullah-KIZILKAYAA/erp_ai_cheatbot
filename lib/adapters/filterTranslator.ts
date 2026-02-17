/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * FILTER TRANSLATOR
 * Converts Odoo-style domain filters [["field", "op", "value"]]
 * into SQL WHERE clauses with parameterized queries.
 */

export type ParamStyle = 'dollar' | 'question' | 'at';

interface TranslatedFilter {
  whereClause: string;
  params: any[];
}

/**
 * Translates Odoo domain filters to SQL WHERE clause.
 *
 * @param filters - Odoo-style domain: [["state", "=", "sale"], ["amount", ">", 1000]]
 * @param paramStyle - Parameter placeholder style:
 *   'dollar' for PostgreSQL ($1, $2, ...)
 *   'question' for MySQL/SQLite (?, ?, ...)
 *   'at' for MSSQL (@p1, @p2, ...)
 */
export function translateFilters(
  filters: any[],
  paramStyle: ParamStyle = 'dollar'
): TranslatedFilter {
  if (!filters || filters.length === 0) {
    return { whereClause: '', params: [] };
  }

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  const getPlaceholder = () => {
    const idx = paramIndex++;
    switch (paramStyle) {
      case 'dollar': return `$${idx}`;
      case 'question': return '?';
      case 'at': return `@p${idx}`;
    }
  };

  for (const filter of filters) {
    if (!Array.isArray(filter) || filter.length < 3) continue;

    const [field, operator, value] = filter;
    const safeField = escapeIdentifier(field);

    switch (operator) {
      case '=':
        if (value === null || value === false) {
          conditions.push(`${safeField} IS NULL`);
        } else {
          conditions.push(`${safeField} = ${getPlaceholder()}`);
          params.push(value);
        }
        break;

      case '!=':
        if (value === null || value === false) {
          conditions.push(`${safeField} IS NOT NULL`);
        } else {
          conditions.push(`${safeField} != ${getPlaceholder()}`);
          params.push(value);
        }
        break;

      case '>':
      case '<':
      case '>=':
      case '<=':
        conditions.push(`${safeField} ${operator} ${getPlaceholder()}`);
        params.push(value);
        break;

      case 'like':
        conditions.push(`${safeField} LIKE ${getPlaceholder()}`);
        params.push(`%${value}%`);
        break;

      case 'ilike':
        conditions.push(`LOWER(${safeField}) LIKE LOWER(${getPlaceholder()})`);
        params.push(`%${value}%`);
        break;

      case 'in':
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(() => getPlaceholder()).join(', ');
          conditions.push(`${safeField} IN (${placeholders})`);
          params.push(...value);
        }
        break;

      case 'not in':
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(() => getPlaceholder()).join(', ');
          conditions.push(`${safeField} NOT IN (${placeholders})`);
          params.push(...value);
        }
        break;

      default:
        // Unknown operator, skip
        console.warn(`Unknown filter operator: ${operator}`);
        break;
    }
  }

  return {
    whereClause: conditions.length > 0 ? conditions.join(' AND ') : '',
    params
  };
}

/**
 * Translates Odoo-style order string to SQL ORDER BY.
 * Input: "date_order DESC, name ASC" or "date_order desc"
 * Output: "date_order DESC, name ASC"
 */
export function translateOrder(order: string): string {
  if (!order || !order.trim()) return '';
  // Odoo order format is the same as SQL, just validate field names
  return order.split(',').map(part => {
    const trimmed = part.trim();
    const [field, dir] = trimmed.split(/\s+/);
    if (!field) return '';
    const safeField = escapeIdentifier(field);
    const direction = dir?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    return `${safeField} ${direction}`;
  }).filter(Boolean).join(', ');
}

/**
 * Escape a SQL identifier to prevent SQL injection.
 * Wraps in double quotes and escapes internal double quotes.
 */
function escapeIdentifier(name: string): string {
  // Only allow alphanumeric, underscore, and dot (for schema.table)
  if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(name)) {
    return `"${name.replace(/"/g, '""')}"`;
  }
  // If contains special chars, quote it
  return `"${name.replace(/"/g, '""')}"`;
}
