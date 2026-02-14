/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * CRM AGENT
 * Specialized in leads, opportunities and sales pipeline KPIs
 */

import { searchReadOdoo, countOdoo } from "@/lib/odooClient";
import { withRetry, withTimeout } from "@/lib/utils/errorHandling";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function processCrmQuery(userQuery: string, history: any[]) {
    const lower = userQuery.toLowerCase();

    // Hard-coded intent: açık CRM fırsatları ve toplam beklenen gelir
    if (lower.includes("açık crm fırsatlarını") || lower.includes("açık fırsatları")) {
        const action = {
            type: "query",
            table: "crm.lead",
            filters: [
                { column: "probability", operator: "gt", value: 0 }
            ],
            fields: ["id", "name", "partner_id", "stage_id", "probability", "expected_revenue"],
            limit: 50,
            order: "probability DESC",
            display: "table"
        };
        return executeCrmOdooAction(JSON.stringify(action), userQuery);
    }

    const systemPrompt = `
    Sen bir **Müşteri İlişkileri (CRM) AI Uzmanısın**. Odoo ERP'de adaylar, fırsatlar ve satış hunisini analiz ediyorsun.
    Görsel mimarideki **CRM Agent** rolündesin.

    SORUMLULUKLARIN:
    - Aday ve fırsatları (crm.lead) takip etmek.
    - Satış hunisi (pipeline) performansını analiz etmek.
    - Kazanma oranları ve beklenen gelir tahminleri raporlamak.

    KURALLAR:
    - SADECE GEÇERLİ JSON formatında yanıt ver. Hiçbir ek metin ekleme.
    - "açık fırsatlar" → probability > 0 filtresi kullan
    - "kazanılan fırsatlar" → probability >= 100 filtresi kullan
    - **Limit**: Varsayılan limit 50 olsun, ancak kullanıcı "tüm" derse limit'i 500'e çıkar.

    GEÇERLİ ALANLAR (crm.lead için):
    - id, name, partner_id, stage_id, probability, expected_revenue

    ÇIKTI FORMATI (ZORUNLU):
    {
        "type": "query",
        "table": "crm.lead",
        "filters": [],
        "fields": ["name", "partner_id", "stage_id", "probability", "expected_revenue"],
        "limit": 50,
        "order": "probability DESC",
        "display": "table"
    }
    `;

    try {
        const response = await withRetry(
            () => withTimeout(
                () => fetch(GROQ_API_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${GROQ_API_KEY}`
                    },
                    body: JSON.stringify({
                        model: "llama-3.3-70b-versatile",
                        messages: [
                            { role: "system", content: systemPrompt },
                            ...history.slice(-5).map((msg: any) => ({
                                role: msg.role === 'bot' ? 'assistant' : 'user',
                                content: msg.content
                            })),
                            { role: "user", content: userQuery }
                        ],
                        temperature: 0.1,
                        max_tokens: 600,
                        response_format: { type: "json_object" }
                    })
                }),
                12000, // 12 second timeout
                'CRM Agent LLM request timed out'
            ),
            { maxRetries: 2, baseDelay: 1000 }
        );

        if (!response.ok) {
            return {
                content: "CRM AI yanıt vermedi.",
                data: null,
                ui_component: null
            };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        return await executeCrmOdooAction(rawContent, userQuery);

    } catch (error: any) {
        console.error("CRM Agent Error:", error);
        return {
            content: "CRM verileri alınamadı.",
            data: null,
            ui_component: null
        };
    }
}

async function executeCrmOdooAction(rawContent: string, userQuery: string) {
    try {
        let action: any;
        try {
            action = JSON.parse(rawContent);
        } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) action = JSON.parse(jsonMatch[0]);
            else throw new Error("No JSON");
        }

        if (!action.type) action.type = "query";
        if (!action.table) action.table = "crm.lead";

        const allowedTables = ["crm.lead"];
        if (!allowedTables.includes(action.table)) {
            action.table = "crm.lead";
        }

        const buildOdooDomain = (filters: any[]) => {
            if (!filters) return [];

            const allowedColumns = ["id", "name", "partner_id", "stage_id", "probability", "expected_revenue"];

            return filters
                .filter((f: any) => f && typeof f.column === "string" && f.column.trim() && allowedColumns.includes(f.column))
                .map((f: any) => {
                    if (f.operator === 'ilike') return [f.column, 'ilike', f.value];
                    if (f.operator === 'eq') return [f.column, '=', f.value];
                    if (f.operator === 'gt') return [f.column, '>', f.value];
                    if (f.operator === 'lt') return [f.column, '<', f.value];
                    if (f.operator === 'gte') return [f.column, '>=', f.value];
                    if (f.operator === 'lte') return [f.column, '<=', f.value];
                    return [f.column, '=', f.value];
                });
        };

        if (action.type === "count") {
            const domain = buildOdooDomain(action.filters);
            const count = await countOdoo(action.table, domain);
            return {
                content: `**CRM Raporu:** Toplam **${count}** kayıt bulundu.`,
                data: { count },
                ui_component: "stat"
            };
        }

        const baseFieldsByTable: Record<string, string[]> = {
            "crm.lead": ["id", "name", "partner_id", "stage_id", "probability", "expected_revenue"]
        };

        const domain = buildOdooDomain(action.filters);
        const requestedFields: string[] = Array.isArray(action.fields) ? action.fields : [];
        const allowedFields = baseFieldsByTable[action.table] || [];

        let fields: string[];
        if (requestedFields.length > 0) {
            fields = requestedFields.filter(f => allowedFields.includes(f));
            if (fields.length === 0) fields = allowedFields;
        } else {
            fields = allowedFields;
        }

        const data = await searchReadOdoo(
            action.table,
            domain,
            fields,
            action.limit || 30,
            action.order || ""
        );

        if (!data || data.length === 0) {
            return {
                content: "Bu kriterlere uygun CRM verisi bulunamadı.",
                data: null,
                ui_component: null
            };
        }

        // Deterministik CRM özeti
        const amounts = data
            .map((r: any) => Number(r.expected_revenue ?? 0))
            .filter((v: number) => !isNaN(v));
        const total = amounts.reduce((a: number, b: number) => a + b, 0);
        const count = amounts.length;

        const wonCount = data.filter((r: any) => Number(r.probability ?? 0) >= 100).length;

        const content =
            `CRM verilerine göre toplam **${count}** aktif fırsat bulunuyor ve bunların ` +
            `beklenen toplam geliri **${total.toLocaleString('tr-TR')}** seviyesinde. ` +
            `Şu ana kadar **${wonCount}** fırsat %100 olasılıkla kazanılmış durumda görünüyor.`;

        return {
            content,
            data,
            ui_component: action.display || "table"
        };

    } catch (error: any) {
        console.error("CRM Action Error:", error);
        return {
            content: "CRM verisi işlenirken hata oluştu: " + error.message,
            data: null,
            ui_component: null
        };
    }
}

