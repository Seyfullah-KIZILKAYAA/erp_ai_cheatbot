/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * INVENTORY AGENT
 * Specialized in stock levels, products, warehouses and supply status
 */

import { searchReadOdoo, countOdoo } from "@/lib/odooClient";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function processInventoryQuery(userQuery: string, history: any[]) {
    const lower = userQuery.toLowerCase();

    // Hard-coded intent: list all products (used by dashboard card)
    if (lower.includes("tüm ürünleri listele")) {
        const action = {
            type: "query",
            table: "product.product",
            filters: [],
            fields: ["id", "name", "qty_available", "list_price", "default_code"],
            limit: 100,
            order: "name ASC",
            display: "table"
        };
        return executeInventoryOdooAction(JSON.stringify(action), userQuery);
    }

    const systemPrompt = `
    Sen bir **Stok ve Depo Yönetimi AI Uzmanısın**. Odoo ERP'de ürün stok seviyeleri, depo hareketleri ve envanter analizi yapıyorsun.
    Görsel mimarideki **Inventory Agent** rolündesin.

    SORUMLULUKLARIN:
    - Kritik stok seviyelerini belirlemek.
    - Stok hareketlerini (stock.move) analiz etmek.
    - Ürün bazlı stok durumu raporlamak.

    KURALLAR:
    - SADECE JSON döndür.
    - **Sayısal Veri**: ASLA markdown kullanma. Saf sayı kullan.
    - **Özet Talebi**: Eğer özet istenirse, stoktaki kritik ürünleri listele. Veri yoksa "Kritik seviyede ürün bulunmuyor" bilgisi ver.
    ÇIKTI FORMATI:
    {
        "type": "query",
        "table": "product.product",
        "filters": [{"column": "qty_available", "operator": "lt", "value": 10}],
        "fields": ["name", "qty_available", "list_price"],
        "limit": 10,
        "order": "qty_available ASC",
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
            return { content: "Stok AI yanıt vermedi.", data: null, ui_component: null };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        return await executeInventoryOdooAction(rawContent, userQuery);

    } catch (error: any) {
        console.error("Inventory Agent Error:", error);
        return { content: "Stok verileri alınamadı.", data: null, ui_component: null };
    }
}

async function executeInventoryOdooAction(rawContent: string, userQuery: string) {
    try {
        let action: any;
        try {
            action = JSON.parse(rawContent);
        } catch (e) {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) action = JSON.parse(jsonMatch[0]);
            else throw new Error("No JSON");
        }

        // --- Normalize / Fallbacks ---
        if (!action.type) {
            action.type = "query";
        }

        if (!action.table) {
            const lower = userQuery.toLowerCase();
            if (lower.includes("hareket")) {
                action.table = "stock.move";
            } else {
                action.table = "product.product";
            }
        }

        const allowedTables = ["product.product", "stock.quant", "stock.move"];
        if (!allowedTables.includes(action.table)) {
            const lower = userQuery.toLowerCase();
            if (lower.includes("hareket")) {
                action.table = "stock.move";
            } else {
                action.table = "product.product";
            }
        }

        const buildOdooDomain = (filters: any[]) => {
            if (!filters) return [];

            const baseFieldsByTable: Record<string, string[]> = {
                "product.product": ["id", "name", "qty_available", "list_price", "default_code"],
                "stock.quant": ["id", "product_id", "location_id", "quantity", "reserved_quantity"],
                "stock.move": ["id", "product_id", "date", "quantity", "state", "location_id", "location_dest_id"]
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
                content: `**Stok Departmanı Raporu:** Toplam **${count}** kayıt bulundu.`,
                data: { count },
                ui_component: 'stat'
            };
        }

        const domain = buildOdooDomain(action.filters);

        const baseFieldsByTable: Record<string, string[]> = {
            "product.product": ["id", "name", "qty_available", "list_price", "default_code"],
            "stock.quant": ["id", "product_id", "location_id", "quantity", "reserved_quantity"],
            "stock.move": ["id", "product_id", "date", "quantity", "state", "location_id", "location_dest_id"]
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
            action.limit || 50,
            action.order || ''
        );

        if (!data || data.length === 0) {
            return {
                content: "Bu kriterlere uygun stok verisi bulunamadı.",
                data: null,
                ui_component: null
            };
        }

        // Deterministic inventory summary
        let content: string;
        if (action.table === "product.product") {
            const qtys = data
                .map((r: any) => Number(r.qty_available ?? 0))
                .filter((v: number) => !isNaN(v));
            const total = qtys.reduce((a: number, b: number) => a + b, 0);
            const count = qtys.length;
            const criticalCount = data.filter((r: any) => Number(r.qty_available ?? 0) <= 0).length;
            const avg = count ? total / count : 0;

            content =
                `Toplam **${count}** ürün için stok bilgisi bulundu. ` +
                `Ürün başına ortalama stok miktarı yaklaşık **${avg.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}** adet. ` +
                `Stok seviyesi **0 veya altında** olan kritik ürün sayısı **${criticalCount}** olarak görünüyor.`;
        } else {
            content =
                `Seçili kriterlere göre ilgili stok hareketleri / miktarları listelendi. ` +
                `Detayları aşağıdaki tabloda görebilirsiniz.`;
        }

        return {
            content,
            data,
            ui_component: action.display || 'table'
        };

    } catch (error: any) {
        console.error("Inventory Action Error:", error);
        return {
            content: "Stok verisi işlenirken hata oluştu: " + error.message,
            data: null,
            ui_component: null
        };
    }
}

async function generateInventorySummary(data: any[], userQuery: string): Promise<string> {
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
                        content: `Sen bir Stok Analisti'sin. Gelen stok verilerini analiz et ve kısa, profesyonel bir özet yaz.
                        
                        KURALLAR:
                        - Verileri tek tek listeleme (tablo zaten gösterilecek)
                        - Kritik stoklar ve hareket trendlerini vurgula
                        - Sayısal verileri özetle (toplam stok, ortalama vb.)
                        - **KRİTİK: Tüm sayısal miktarları mutlaka KALIN (bold) formatta yaz (ör: **25 adet**).**
                        - Maksimum 3-4 cümle yaz
                        - Stok / lojistik departmanı perspektifinden yaz`
                    },
                    {
                        role: "user",
                        content: `Kullanıcı Sorusu: ${userQuery}\n\nVeri: ${JSON.stringify(data).slice(0, 2000)}`
                    }
                ]
            })
        });

        const summaryData = await response.json();
        return summaryData.choices[0]?.message?.content || "Stok verileri hazır.";

    } catch (error) {
        return "**Stok Departmanı:** Veriler başarıyla getirildi.";
    }
}

