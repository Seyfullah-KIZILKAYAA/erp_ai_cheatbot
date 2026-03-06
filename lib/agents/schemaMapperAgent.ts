/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * SCHEMA MAPPER AGENT (LLM-FIRST)
 * Uses LLM as the PRIMARY method to map discovered database tables and columns
 * to semantic ERP concepts (customers, salesOrders, invoices, etc.).
 *
 * Key features:
 * - FK-aware: sends foreign key relationships to LLM for better understanding
 * - Fuzzy validation: handles casing differences and minor LLM typos
 * - Batch field mapping: maps ALL entity fields in a single LLM call
 * - Pattern hints: accepts pre-filter suggestions that LLM can confirm or override
 *
 * Works with ANY naming convention: Turkish, English, abbreviated, custom.
 */

import type { TableMapping } from '@/lib/config/tableMapping';
import type { AllFieldMappings, EntityFieldMap } from '@/lib/config/fieldMapping';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export interface SchemaTableInput {
  name: string;
  fields: { name: string; type: string; primaryKey?: boolean }[];
  foreignKeys?: { column: string; refTable: string; refColumn: string }[];
}

export interface SchemaMapResult {
  tableMapping: Partial<TableMapping>;
  fieldMappings: Partial<AllFieldMappings>;
}

const SEMANTIC_ENTITIES: Record<string, string> = {
  salesOrders: 'Satis siparisleri / Sales Orders — siparis numarasi, musteri, toplam tutar, durum, tarih',
  customers: 'Musteriler / Partners / Contacts — ad, email, telefon, sehir, sirket mi',
  products: 'Urunler / Products — urun adi, stok miktari, fiyat, urun kodu',
  invoices: 'Faturalar / Invoices — fatura no, musteri, tutar, odeme durumu, tarih',
  payments: 'Odemeler / Payments — odeme referansi, musteri, tutar, odeme tipi, tarih',
  purchaseOrders: 'Satin Alma Siparisleri / Purchase Orders — siparis no, tedarikci, tutar, durum, tarih',
  employees: 'Calisanlar / Employees — ad, email, telefon, departman, gorev',
  crmLeads: 'CRM Firsatlari / Leads / Opportunities — firsat adi, musteri, asama, olasilik, beklenen gelir',
  stockMoves: 'Stok Hareketleri / Stock Moves — urun, tarih, miktar, durum, kaynak, hedef',
  stockQuants: 'Stok Miktarlari / Stock Quants — urun, lokasyon, miktar, rezerve miktar',
  departments: 'Departmanlar / Departments — departman adi',
  companies: 'Sirketler / Companies — sirket adi',
  crmStages: 'CRM Asamalari / Pipeline Stages — asama adi',
};

const FIELD_CONCEPTS: Record<string, Record<string, string>> = {
  salesOrders: {
    id: 'Benzersiz kayit ID (primary key)',
    name: 'Siparis numarasi / referansi',
    customer: 'Musteri ID veya adi (foreign key)',
    totalAmount: 'Toplam tutar / siparis tutari',
    status: 'Siparis durumu (draft, confirmed, done vb.)',
    date: 'Siparis tarihi',
  },
  customers: {
    id: 'Benzersiz kayit ID (primary key)',
    name: 'Musteri / partner adi',
    email: 'E-posta adresi',
    phone: 'Telefon numarasi',
    city: 'Sehir / lokasyon',
    isCompany: 'Sirket mi yoksa bireysel mi (boolean)',
  },
  products: {
    id: 'Benzersiz kayit ID (primary key)',
    name: 'Urun adi',
    quantity: 'Stok miktari / mevcut miktar',
    price: 'Satis fiyati / liste fiyati',
    code: 'Urun kodu / SKU / barkod',
  },
  invoices: {
    id: 'Benzersiz kayit ID (primary key)',
    name: 'Fatura numarasi / referansi',
    customer: 'Musteri ID veya adi (foreign key)',
    totalAmount: 'Toplam fatura tutari',
    paymentStatus: 'Odeme durumu (paid, not_paid vb.)',
    status: 'Fatura durumu (draft, posted vb.)',
    date: 'Fatura tarihi',
  },
  payments: {
    id: 'Benzersiz kayit ID (primary key)',
    name: 'Odeme referansi / numarasi',
    customer: 'Musteri ID veya adi (foreign key)',
    amount: 'Odeme tutari',
    type: 'Odeme tipi (inbound, outbound, havale, kredi karti vb.)',
    date: 'Odeme tarihi',
    status: 'Odeme durumu',
  },
  purchaseOrders: {
    id: 'Benzersiz kayit ID (primary key)',
    name: 'Siparis numarasi / referansi',
    vendor: 'Tedarikci ID veya adi (foreign key)',
    totalAmount: 'Toplam tutar',
    status: 'Siparis durumu',
    date: 'Siparis tarihi',
  },
  employees: {
    id: 'Benzersiz kayit ID (primary key)',
    name: 'Calisan adi',
    email: 'Is e-postasi',
    phone: 'Telefon numarasi',
    department: 'Departman ID veya adi (foreign key)',
    jobTitle: 'Gorev unvani / pozisyon',
  },
  crmLeads: {
    id: 'Benzersiz kayit ID (primary key)',
    name: 'Firsat / lead adi',
    customer: 'Musteri ID veya adi (foreign key)',
    stage: 'Asama ID veya adi (foreign key)',
    probability: 'Kazanma olasiligi (yuzde)',
    expectedRevenue: 'Beklenen gelir / deger',
  },
  stockMoves: {
    id: 'Benzersiz kayit ID (primary key)',
    product: 'Urun ID veya adi (foreign key)',
    date: 'Hareket tarihi',
    quantity: 'Miktar',
    status: 'Hareket durumu',
    source: 'Kaynak lokasyon',
    destination: 'Hedef lokasyon',
  },
  stockQuants: {
    id: 'Benzersiz kayit ID (primary key)',
    product: 'Urun ID veya adi (foreign key)',
    location: 'Lokasyon / depo',
    quantity: 'Mevcut miktar',
    reserved: 'Rezerve miktar',
  },
  departments: {
    id: 'Benzersiz kayit ID (primary key)',
    name: 'Departman adi',
  },
};

// ─── Fuzzy Matching ───────────────────────────────────────────────────────

/**
 * Simple Levenshtein distance for fuzzy matching.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Fuzzy-match a candidate name against valid names.
 * Returns the actual name from validNames or null.
 */
function fuzzyMatchName(candidate: string, validNames: string[]): string | null {
  // 1. Exact match
  const exact = validNames.find(n => n === candidate);
  if (exact) return exact;

  // 2. Case-insensitive match
  const ci = validNames.find(n => n.toLowerCase() === candidate.toLowerCase());
  if (ci) return ci;

  // 3. Trimmed match
  const trimmed = validNames.find(
    n => n.trim().toLowerCase() === candidate.trim().toLowerCase()
  );
  if (trimmed) return trimmed;

  // 4. Levenshtein distance <= 2 (minor typos)
  for (const name of validNames) {
    if (levenshtein(name.toLowerCase(), candidate.toLowerCase()) <= 2) {
      return name;
    }
  }

  return null;
}

// ─── LLM Calls ───────────────────────────────────────────────────────────

async function callGroqLLM(systemPrompt: string, userPrompt: string, maxTokens: number = 800): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API Error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '{}';
}

// ─── Main Entry Point ────────────────────────────────────────────────────

/**
 * LLM-FIRST full schema mapping.
 * Maps ALL 13 entities (not just unmapped ones).
 * Accepts optional pattern hints as suggestions the LLM can confirm or override.
 *
 * Makes exactly 2 LLM calls: 1 for table mapping, 1 for all field mappings.
 */
export async function mapFullSchemaWithLLM(
  tables: SchemaTableInput[],
  patternHints?: Partial<TableMapping>
): Promise<SchemaMapResult> {
  if (!GROQ_API_KEY) {
    console.warn('[SCHEMA MAPPER] GROQ_API_KEY not set, skipping LLM mapping');
    return { tableMapping: {}, fieldMappings: {} };
  }

  if (tables.length === 0) {
    return { tableMapping: {}, fieldMappings: {} };
  }

  console.log(`[SCHEMA MAPPER] Starting LLM-FIRST mapping for ALL entities...`);
  console.log(`[SCHEMA MAPPER] Available tables: ${tables.map(t => t.name).join(', ')}`);

  try {
    // Step 1: Map ALL tables to ALL semantic entities
    const tableMapping = await mapTablesToEntitiesFull(tables, patternHints);

    // Step 2: Batch map fields for ALL successfully mapped tables
    const fieldMappings = await mapAllFieldsBatch(tables, tableMapping);

    console.log(`[SCHEMA MAPPER] LLM mapping complete:`, {
      tables: Object.entries(tableMapping).filter(([, v]) => v).map(([k, v]) => `${k} -> ${v}`),
      fieldEntities: Object.keys(fieldMappings),
    });

    return { tableMapping, fieldMappings };

  } catch (error) {
    console.error('[SCHEMA MAPPER] LLM mapping failed:', error);
    return { tableMapping: {}, fieldMappings: {} };
  }
}

/**
 * Backward-compatible wrapper.
 * Delegates to mapFullSchemaWithLLM but only returns mappings for the specified entities.
 */
export async function mapSchemaWithLLM(
  tables: SchemaTableInput[],
  unmappedEntities: string[]
): Promise<SchemaMapResult> {
  const result = await mapFullSchemaWithLLM(tables);

  // Filter to only unmapped entities for backward compatibility
  const filtered: Partial<TableMapping> = {};
  for (const entity of unmappedEntities) {
    if ((result.tableMapping as any)[entity]) {
      (filtered as any)[entity] = (result.tableMapping as any)[entity];
    }
  }

  const filteredFields: Partial<AllFieldMappings> = {};
  for (const entity of unmappedEntities) {
    if ((result.fieldMappings as any)[entity]) {
      (filteredFields as any)[entity] = (result.fieldMappings as any)[entity];
    }
  }

  return { tableMapping: filtered, fieldMappings: filteredFields };
}

// ─── Step 1: Table Mapping ───────────────────────────────────────────────

/**
 * Ask LLM to match ALL tables to ALL semantic ERP entities.
 * Includes FK relationships and pattern hints for better accuracy.
 */
async function mapTablesToEntitiesFull(
  tables: SchemaTableInput[],
  patternHints?: Partial<TableMapping>
): Promise<Partial<TableMapping>> {
  // Build FK-annotated table summary
  const tableSummary = tables.map(t => {
    const fieldDescriptions = t.fields.slice(0, 50).map(f => {
      let desc = `${f.name}(${f.type})`;
      if (f.primaryKey) desc = `${f.name}(${f.type},PK)`;
      // Check if this field is a FK
      const fk = t.foreignKeys?.find(fk => fk.column === f.name);
      if (fk) desc = `${f.name}(${f.type},FK->${fk.refTable}.${fk.refColumn})`;
      return desc;
    }).join(', ');
    return `- "${t.name}": [${fieldDescriptions}]`;
  }).join('\n');

  // Build FK relationships section
  let fkSection = '';
  const fkRelations: string[] = [];
  for (const t of tables) {
    if (t.foreignKeys) {
      for (const fk of t.foreignKeys) {
        fkRelations.push(`${t.name}.${fk.column} -> ${fk.refTable}.${fk.refColumn}`);
      }
    }
  }
  if (fkRelations.length > 0) {
    fkSection = `\nFOREIGN KEY ILISKILERI:\n${fkRelations.map(r => `- ${r}`).join('\n')}\n`;
  }

  // Build entity descriptions — ALL entities
  const entityDescriptions = Object.entries(SEMANTIC_ENTITIES)
    .map(([key, desc]) => `- "${key}": ${desc}`)
    .join('\n');

  // Build pattern hints section
  let hintSection = '';
  if (patternHints) {
    const hints = Object.entries(patternHints)
      .filter(([, v]) => v)
      .map(([k, v]) => `  ${k} -> ${v}`)
      .join('\n');
    if (hints) {
      hintSection = `\nOTOMATIK TESPIT ONERILERI (dogrulayin veya degistirin):\n${hints}\n`;
    }
  }

  const systemPrompt = `Sen bir veritabani sema analiz uzmansin. Sana bir veritabanindaki tablolar, kolonlari ve foreign key iliskileri verilecek.
Gorevim bu tablolari ERP kavramlarina eslemek.

VERITABANINDAKI TABLOLAR VE KOLONLARI:
${tableSummary}
${fkSection}
ESLEMEM GEREKEN ERP KAVRAMLARI:
${entityDescriptions}
${hintSection}
KURALLAR:
- Her ERP kavramini en uygun tablo ile esle.
- Foreign key iliskilerine dikkat et — bir tablo baska bir tabloya FK ile baglaniyorsa, bu tablonun rolunu anlamana yardimci olur.
- Eger bir kavram icin uygun tablo YOKSA, o kavram icin null dondur.
- Tablo isimlerini BIREBIR kullan, degistirme.
- Kolon isimlerine ve FK iliskilerine bakarak tablonun ne ise yaradigini anla.
- Bir tabloyu birden fazla kavrama esleme. Her tablo en fazla bir kavrama ait olabilir.
- SADECE JSON formatinda yanit ver, baska bir sey yazma.

CIKTI FORMATI:
{
  "salesOrders": "tablo_adi_veya_null",
  "customers": "tablo_adi_veya_null",
  "products": "tablo_adi_veya_null",
  ...tum 13 kavram icin
}`;

  const rawContent = await callGroqLLM(
    systemPrompt,
    'Yukaridaki tablolari ERP kavramlarina esle. TUM 13 kavram icin cevap ver.',
    600
  );

  console.log(`[SCHEMA MAPPER] Table mapping LLM response:`, rawContent);

  const parsed = JSON.parse(rawContent);

  // Fuzzy-validate: ensure mapped table names actually exist
  const validTableNames = tables.map(t => t.name);
  const result: Partial<TableMapping> = {};

  for (const [entity, tableName] of Object.entries(parsed)) {
    if (!tableName || typeof tableName !== 'string' || tableName === 'null') continue;

    const matched = fuzzyMatchName(tableName, validTableNames);
    if (matched) {
      (result as any)[entity] = matched;
    } else {
      console.warn(`[SCHEMA MAPPER] LLM returned "${tableName}" for ${entity}, but no matching table found (fuzzy search failed)`);
    }
  }

  return result;
}

// ─── Step 2: Batch Field Mapping ─────────────────────────────────────────

/**
 * Map fields for ALL mapped entities in a single LLM call.
 * Reduces API calls from N+1 to just 2 (one for tables, one for all fields).
 */
async function mapAllFieldsBatch(
  tables: SchemaTableInput[],
  tableMapping: Partial<TableMapping>
): Promise<Partial<AllFieldMappings>> {
  // Build the entities that have mapped tables and field concepts
  const entitiesToMap: { entity: string; tableName: string; table: SchemaTableInput; concepts: Record<string, string> }[] = [];

  for (const [entity, tableName] of Object.entries(tableMapping)) {
    if (!tableName) continue;
    const table = tables.find(t => t.name === tableName);
    if (!table || !table.fields.length) continue;
    const concepts = FIELD_CONCEPTS[entity];
    if (!concepts) continue;
    entitiesToMap.push({ entity, tableName, table, concepts });
  }

  if (entitiesToMap.length === 0) {
    return {};
  }

  // Build a combined prompt for ALL entities
  const entitySections = entitiesToMap.map(({ entity, tableName, table, concepts }) => {
    const fieldList = table.fields.slice(0, 50).map(f => {
      let desc = `"${f.name}" (${f.type})`;
      if (f.primaryKey) desc = `"${f.name}" (${f.type}, PK)`;
      return desc;
    }).join(', ');

    const conceptList = Object.entries(concepts)
      .map(([key, desc]) => `    "${key}": ${desc}`)
      .join('\n');

    return `  "${entity}" (tablo: "${tableName}"):
    KOLONLAR: [${fieldList}]
    ALANLAR:
${conceptList}`;
  }).join('\n\n');

  const systemPrompt = `Sen bir veritabani sema analiz uzmansin.
Birden fazla tablo icin kolon-alan eslemesi yapacaksin.

ESLEME YAPILACAK TABLOLAR:
${entitySections}

KURALLAR:
- Her entity icin, her semantik alan icin en uygun kolonu sec.
- Kolon isimlerini BIREBIR kullan, degistirme.
- Eger bir alan icin uygun kolon YOKSA, o alani ekleme.
- SADECE JSON formatinda yanit ver.

CIKTI FORMATI:
{
  "entity_adi": {
    "id": "kolon_adi",
    "name": "kolon_adi",
    ...
  },
  ...her entity icin
}`;

  const rawContent = await callGroqLLM(
    systemPrompt,
    `Yukaridaki ${entitiesToMap.length} entity icin kolon eslemesi yap.`,
    1200
  );

  console.log(`[SCHEMA MAPPER] Field mapping LLM response:`, rawContent);

  const parsed = JSON.parse(rawContent);

  // Fuzzy-validate field names
  const result: Partial<AllFieldMappings> = {};

  for (const { entity, table } of entitiesToMap) {
    const entityFields = parsed[entity];
    if (!entityFields || typeof entityFields !== 'object') continue;

    const validFieldNames = table.fields.map(f => f.name);
    const mapped: EntityFieldMap = {};

    for (const [semantic, fieldName] of Object.entries(entityFields)) {
      if (!fieldName || typeof fieldName !== 'string') continue;

      const matched = fuzzyMatchName(fieldName, validFieldNames);
      if (matched) {
        mapped[semantic] = matched;
      }
    }

    if (Object.keys(mapped).length > 0) {
      (result as any)[entity] = mapped;
    }
  }

  return result;
}
