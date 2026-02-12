/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PURCHASING AGENT
 * Specialized in purchase orders, vendors and procurement KPIs
 */

import { searchReadOdoo, countOdoo } from "@/lib/odooClient";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function processPurchasingQuery(userQuery: string, history: any[]) {
    const lower = userQuery.toLowerCase();

    // Hard-coded intent: bekleyen satın alma siparişleri
    if (lower.includes("bekleyen satın alma siparişlerini")) {
        const action = {
            type: "query",
            table: "purchase.order",
            // Basit yaklaşım: satın alma siparişleri, state != 'done' / 'cancel'
            filters: [],
            fields: ["id", "name", "partner_id", "amount_total", "state", "date_order"],
            limit: 50,
            order: "date_order DESC",
            display: "table"
        };
        return executePurchasingOdooAction(JSON.stringify(action), userQuery);
    }

    const systemPrompt = `
    Sen bir **Satın Alma ve Tedarik Zinciri AI Uzmanısın**. Odoo ERP'de satın alma siparişleri, tedarikçi yönetimi ve alım operasyonlarını analiz ediyorsun.
    Görsel mimarideki **Purchasing Agent** rolündesin.

    SORUMLULUKLARIN:
    - Satın alma siparişlerini (purchase.order) takip etmek.
    - Tedarikçi (res.partner) verilerini analiz etmek.
    - Bekleyen/Onaylanan alımları raporlamak.

    KURALLAR:
    - SADECE JSON döndür.
    - Tarih filtreleri için '>=', '<=' kullan.
    - "Bekleyen satın almalar" veya "onay bekleyen siparişler" denirse state = 'purchase' veya 'to approve' gibi statüleri filtrelemeye çalış.

    ÇIKTI ÖRNEĞİ:
    {
        "type": "query",
        "table": "purchase.order",
        "filters": [{"column": "state", "operator": "eq", "value": "purchase"}],
        "fields": ["name", "partner_id", "amount_total", "state", "date_order"],
        "limit": 20,
        "order": "date_order DESC",
        "display": "table"
    }
    `;

    try {
        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY} `
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
        });

        if (!response.ok) {
            return {
                content: "Satın alma AI yanıt vermedi.",
                data: null,
                ui_component: null
            };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        return await executePurchasingOdooAction(rawContent, userQuery);

    } catch (error: any) {
        console.error("Purchasing Agent Error:", error);
        return {
            content: "Satın alma verileri alınamadı.",
            data: null,
            ui_component: null
        };
    }
}

async function executePurchasingOdooAction(rawContent: string, userQuery: string) {
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
        if (!action.table) action.table = "purchase.order";

        const allowedTables = ["purchase.order", "res.partner"];
        if (!allowedTables.includes(action.table)) {
            const lower = userQuery.toLowerCase();
            action.table = lower.includes("tedarikçi") ? "res.partner" : "purchase.order";
        }

        const buildOdooDomain = (filters: any[]) => {
            if (!filters) return [];

            const baseFieldsByTable: Record<string, string[]> = {
                "purchase.order": ["id", "name", "partner_id", "amount_total", "state", "date_order"],
                "res.partner": ["id", "name", "email", "phone", "city", "is_company"]
            };
            const allowedColumns = baseFieldsByTable[action.table] || [];

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
                content: `** Satın Alma Raporu:** Toplam ** ${count}** kayıt bulundu.`,
                data: { count },
                ui_component: "stat"
            };
        }

        const baseFieldsByTable: Record<string, string[]> = {
            "purchase.order": ["id", "name", "partner_id", "amount_total", "state", "date_order"],
            "res.partner": ["id", "name", "email", "phone", "city", "is_company"]
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
            action.limit || 20,
            action.order || ""
        );

        if (!data || data.length === 0) {
            return {
                content: "Bu kriterlere uygun satın alma verisi bulunamadı.",
                data: null,
                ui_component: null
            };
        }

        // Deterministik satın alma özeti
        let content: string;
        if (action.table === "purchase.order") {
            const amounts = data
                .map((r: any) => Number(r.amount_total ?? 0))
                .filter((v: number) => !isNaN(v));
            const total = amounts.reduce((a: number, b: number) => a + b, 0);
            const count = amounts.length;

            content =
                `Satın alma tarafında toplam ** ${count}** adet sipariş görünüyor ve bunların ` +
                `toplam tutarı ** ${total.toLocaleString('tr-TR')}** seviyesinde. ` +
                `Detayları aşağıdaki tabloda inceleyebilirsiniz.`;
        } else {
            const count = data.length;
            const companyCount = data.filter((r: any) => r.is_company).length;
            content =
                `Toplam ** ${count}** adet tedarikçi kaydı listelendi.Bunların ** ${companyCount}** tanesi şirket olarak işaretlenmiş durumda.`;
        }

        return {
            content,
            data,
            ui_component: action.display || "table"
        };

    } catch (error: any) {
        console.error("Purchasing Action Error:", error);
        return {
            content: "Satın alma verisi işlenirken hata oluştu: " + error.message,
            data: null,
            ui_component: null
        };
    }
}

