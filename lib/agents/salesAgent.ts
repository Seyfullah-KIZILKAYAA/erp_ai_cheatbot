/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * SALES AGENT
 * Specialized in sales orders, quotations, customer relationships, and revenue analysis
 */

import { searchReadOdoo, countOdoo } from "@/lib/odooClient";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function processSalesQuery(userQuery: string, history: any[]) {
    const lower = userQuery.toLowerCase();

    // --- Hard-coded intents for stability (bypass LLM) ---
    if (lower.includes("tüm müşterileri listele")) {
        const action = {
            type: "query",
            table: "res.partner",
            filters: [],
            fields: ["id", "name", "email", "phone", "city", "is_company"],
            limit: 100,
            order: "name ASC",
            display: "table"
        };
        return executeOdooAction(JSON.stringify(action), userQuery);
    }

    if (lower.includes("satış siparişlerini listele")) {
        const action = {
            type: "query",
            table: "sale.order",
            filters: [],
            fields: ["id", "name", "partner_id", "amount_total", "state", "date_order"],
            limit: 50,
            order: "date_order DESC",
            display: "table"
        };
        return executeOdooAction(JSON.stringify(action), userQuery);
    }

    if (lower.includes("taslak teklifleri listele")) {
        const action = {
            type: "query",
            table: "sale.order",
            filters: [{ column: "state", operator: "eq", value: "draft" }],
            fields: ["id", "name", "partner_id", "amount_total", "state", "date_order"],
            limit: 50,
            order: "date_order DESC",
            display: "table"
        };
        return executeOdooAction(JSON.stringify(action), userQuery);
    }

    // CRM odaklı istekler için satış ajanını zorlamaya gerek yok
    if (lower.includes("crm fırsat")) {
        return {
            content: "Bu istek CRM ajanı tarafından işlendiği için satış tarafında ek veri getirilmedi.",
            data: null,
            ui_component: null
        };
    }

    const systemPrompt = `
    Sen bir **Satış Departmanı AI Uzmanısın**. Odoo ERP sisteminde satış siparişleri, müşteri verileri ve gelir analizlerini yönetiyorsun.
    Görsel mimarideki **Sales Agent** rolündesin.

    SORUMLULUKLARIN:
    - Satış siparişlerini (sale.order) ve teklifleri analiz etmek.
    - Müşteri (res.partner) portföyünü raporlamak.
    - Satış gelirleri ve trendleri hakkında özetler hazırlamak.

    KURALLAR:
    - SADECE JSON döndür.
    - Tarih filtreleri için '>=', '<=' kullan. Bugün: ${new Date().toISOString().split('T')[0]}
    - **Sayısal Veri**: ASLA markdown (ör: **10**) kullanma. Saf sayı kullan.
    - **Özet Talebi**: Eğer özet istenirse, bugün yapılmış onaylı satışları (state='sale') ara. Eğer veri yoksa, "Bugün henüz onaylı satış yapılmadı" bilgisini dön.

    ÇIKTI FORMATI:
    {
        "type": "query",
        "table": "sale.order",
        "filters": [{"column": "state", "operator": "eq", "value": "sale"}],
        "fields": ["name", "partner_id", "amount_total"],
        "limit": 10,
        "order": "amount_total DESC",
        "display": "table"
    }
    `;

    try {
        const response = await fetch(GROQ_API_URL, {
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
                max_tokens: 800,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Sales Agent LLM Error:", response.status, errorText);
            return {
                content: `Satış AI servisinden yanıt alınamadı.`,
                data: null,
                ui_component: null
            };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        return await executeOdooAction(rawContent, userQuery);

    } catch (error: any) {
        console.error("Sales Agent Error:", error);
        return {
            content: "Satış verilerini çekerken bir hata oluştu.",
            data: null,
            ui_component: null
        };
    }
}

async function executeOdooAction(rawContent: string, userQuery: string) {
    try {
        let action: any;
        try {
            action = JSON.parse(rawContent);
        } catch (e) {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                action = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("No JSON found in response");
            }
        }

        // --- Normalize / Fallbacks for action ---
        if (!action.type) {
            action.type = "query";
        }

        if (!action.table) {
            const lower = userQuery.toLowerCase();
            if (lower.includes("müşteri")) {
                action.table = "res.partner";
            } else {
                action.table = "sale.order";
            }
        }

        // Only allow known tables
        const allowedTables = ["sale.order", "res.partner"];
        if (!allowedTables.includes(action.table)) {
            // Fallback by intent
            const lower = userQuery.toLowerCase();
            if (lower.includes("müşteri")) {
                action.table = "res.partner";
            } else {
                action.table = "sale.order";
            }
        }

        const buildOdooDomain = (filters: any[]) => {
            if (!filters) return [];
            const baseFieldsByTable: Record<string, string[]> = {
                "sale.order": ["id", "name", "partner_id", "amount_total", "state", "date_order"],
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

        if (action.type === 'count') {
            const domain = buildOdooDomain(action.filters);
            const count = await countOdoo(action.table, domain);
            return {
                content: `**Satış Departmanı Raporu:** Toplam **${count}** kayıt bulundu.`,
                data: { count },
                ui_component: 'stat'
            };
        }

        // --- QUERY BRANCH ---
        const domain = buildOdooDomain(action.filters);

        // Whitelist fields per table to avoid "Invalid field" errors
        const baseFieldsByTable: Record<string, string[]> = {
            "sale.order": ["id", "name", "partner_id", "amount_total", "state", "date_order"],
            "res.partner": ["id", "name", "email", "phone", "city", "is_company"]
        };

        const requestedFields: string[] = Array.isArray(action.fields) ? action.fields : [];
        const allowedFields = baseFieldsByTable[action.table] || [];

        let fields: string[];
        if (requestedFields.length > 0) {
            fields = requestedFields.filter(f => allowedFields.includes(f));
            if (fields.length === 0) {
                fields = allowedFields;
            }
        } else {
            fields = allowedFields;
        }

        const data = await searchReadOdoo(
            action.table,
            domain,
            fields,
            action.limit || 10,
            action.order || ''
        );

        if (!data || data.length === 0) {
            return {
                content: "Bu kritere uygun satış verisi bulunamadı.",
                data: null,
                ui_component: null
            };
        }

        // Deterministic numeric summary (no extra LLM çağrısı)
        let content: string;
        if (action.table === "sale.order") {
            const amounts = data
                .map((r: any) => Number(r.amount_total ?? 0))
                .filter((v: number) => !isNaN(v));
            const total = amounts.reduce((a: number, b: number) => a + b, 0);
            const count = amounts.length;
            const max = amounts.length ? Math.max(...amounts) : 0;
            const min = amounts.length ? Math.min(...amounts) : 0;
            const avg = count ? total / count : 0;

            content =
                `Satış departmanı verilerine göre toplam **${total.toLocaleString('tr-TR')}** tutarında ` +
                `**${count}** adet sipariş bulunuyor. ` +
                `En yüksek sipariş tutarı **${max.toLocaleString('tr-TR')}**, en düşük sipariş tutarı ise ` +
                `**${min.toLocaleString('tr-TR')}** seviyesinde. ` +
                `Ortalama sipariş büyüklüğü yaklaşık **${avg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}** olarak görünüyor.`;
        } else {
            // res.partner özet
            const count = data.length;
            const companyCount = data.filter((r: any) => r.is_company).length;
            content =
                `Toplam **${count}** adet müşteri kaydı listelendi. ` +
                `Bunların **${companyCount}** tanesi şirket, kalanları bireysel müşterilerden oluşuyor.`;
        }

        return {
            content,
            data,
            ui_component: action.display || 'table'
        };

    } catch (error: any) {
        console.error("Sales Action Error:", error);
        return {
            content: "Satış verisi işlenirken bir hata oluştu: " + error.message,
            data: null,
            ui_component: null
        };
    }
}

async function generateSalesSummary(data: any[], userQuery: string): Promise<string> {
    try {
        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: `Sen bir Satış Analisti'sin. Gelen satış verilerini analiz et ve kısa, profesyonel bir özet yaz.
                        
                        KURALLAR:
                        - Verileri tek tek listeleme (tablo zaten gösterilecek)
                        - Genel trendleri ve önemli bulguları vurgula
                        - Sayısal verileri özetle (toplam, ortalama, en yüksek/düşük)
                        - **KRİTİK: Tüm sayısal verileri, tutarları ve para birimi simgelerini (TL, $, €) mutlaka KALIN (bold) formatta yaz (ör: **150.000 TL**).**
                        - Maksimum 3-4 cümle yaz
                        - Satış departmanı perspektifinden yaz`
                    },
                    {
                        role: "user",
                        content: `Kullanıcı Sorusu: ${userQuery}\n\nVeri: ${JSON.stringify(data).slice(0, 2000)}`
                    }
                ]
            })
        });

        const summaryData = await response.json();
        return summaryData.choices[0]?.message?.content || "Satış verileri hazır.";

    } catch (error) {
        return "**Satış Departmanı:** Veriler başarıyla getirildi.";
    }
}
