/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * FINANCE AGENT
 * Specialized in invoices, payments, cash/bank position and accounting KPIs
 */

import { searchReadOdoo, countOdoo } from "@/lib/odooClient";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function processFinanceQuery(userQuery: string, history: any[]) {
    const systemPrompt = `
    Sen bir **Finans ve Muhasebe AI Uzmanısın**. Odoo ERP'de faturalar, ödemeler ve finansal performansı analiz ediyorsun.
    Görsel mimarideki **Finance Agent** rolündesin.

    SORUMLULUKLARIN:
    - Müşteri ve tedarikçi faturalarını (account.move) analiz etmek.
    - Ödemeleri (account.payment) takip etmek.
    - Nakit akışı ve ödenmemiş fatura raporları hazırlamak.

    KURALLAR:
    - SADECE JSON döndür.
    - Tarih filtreleri için '>=', '<=' kullan. Bugün: ${new Date().toISOString().split('T')[0]}
    - **Sayısal Veri**: ASLA markdown kullanma. Saf sayı kullan.
    - **Özet Talebi**: Eğer özet istenirse, bugün yapılmış onaylı faturaları (state='posted') ara. Eğer veri yoksa, "Bugün henüz onaylı fatura kaydı yok" bilgisini dön.

    ÇIKTI FORMATI:
    {
        "type": "query",
        "table": "account.move",
        "filters": [{"column": "state", "operator": "eq", "value": "posted"}],
        "fields": ["name", "partner_id", "amount_total"],
        "limit": 10,
        "order": "invoice_date DESC",
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
            return { content: "Finans AI yanıt vermedi.", data: null, ui_component: null };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        return await executeFinanceOdooAction(rawContent, userQuery);

    } catch (error: any) {
        console.error("Finance Agent Error:", error);
        return { content: "Finans verileri alınamadı.", data: null, ui_component: null };
    }
}

async function executeFinanceOdooAction(rawContent: string, userQuery: string) {
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
            if (lower.includes("ödeme")) {
                action.table = "account.payment";
            } else {
                action.table = "account.move";
            }
        }

        const allowedTables = ["account.move", "account.payment"];
        if (!allowedTables.includes(action.table)) {
            const lower = userQuery.toLowerCase();
            if (lower.includes("ödeme")) {
                action.table = "account.payment";
            } else {
                action.table = "account.move";
            }
        }

        const buildOdooDomain = (filters: any[]) => {
            if (!filters) return [];
            return filters.map((f: any) => {
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
                content: `**Finans Departmanı Raporu:** Toplam **${count}** kayıt bulundu.`,
                data: { count },
                ui_component: 'stat'
            };
        }

        const domain = buildOdooDomain(action.filters);

        const baseFieldsByTable: Record<string, string[]> = {
            "account.move": ["id", "name", "partner_id", "amount_total", "payment_state", "state", "invoice_date"],
            "account.payment": ["id", "name", "partner_id", "amount", "payment_type", "date", "state"]
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

        let data = await searchReadOdoo(
            action.table,
            domain,
            fields,
            action.limit || 20,
            action.order || ''
        );

        if (!data || data.length === 0) {
            // Eğer kullanıcı özet / bugün odaklı bir rapor istediyse, tarih filtresini gevşetip tekrar dene
            const lower = userQuery.toLowerCase();
            const wantsSummary = lower.includes("özet") || lower.includes("rapor");
            const mentionsToday = lower.includes("bugün");

            if (wantsSummary || mentionsToday) {
                // Tarih ile ilgili filtreleri kaldır (invoice_date, date)
                const relaxedFilters = (action.filters || []).filter(
                    (f: any) => f.column !== "invoice_date" && f.column !== "date"
                );
                const relaxedDomain = buildOdooDomain(relaxedFilters);

                data = await searchReadOdoo(
                    action.table,
                    relaxedDomain,
                    fields,
                    action.limit || 20,
                    action.order || ''
                );

                if (!data || data.length === 0) {
                    return {
                        content: "Bugün için uygun finansal kayıt bulunamadı ve geçmiş verilerde de sonuç alınamadı.",
                        data: null,
                        ui_component: null
                    };
                }

                // Aşağıda genel özet akışına düşecek
            } else {
                return {
                    content: "Bu kriterlere uygun finansal veri bulunamadı.",
                    data: null,
                    ui_component: null
                };
            }
        }

        // Deterministic finance summary
        let content: string;
        if (action.table === "account.move") {
            const amounts = data
                .map((r: any) => Number(r.amount_total ?? 0))
                .filter((v: number) => !isNaN(v));
            const total = amounts.reduce((a: number, b: number) => a + b, 0);
            const count = amounts.length;
            const max = amounts.length ? Math.max(...amounts) : 0;
            const min = amounts.length ? Math.min(...amounts) : 0;

            content =
                `Finans verilerine göre toplam **${total.toLocaleString('tr-TR')}** tutarında ` +
                `**${count}** adet fatura kaydı bulundu. ` +
                `En yüksek fatura tutarı **${max.toLocaleString('tr-TR')}**, en düşük fatura tutarı ise ` +
                `**${min.toLocaleString('tr-TR')}** seviyesinde.`;
        } else {
            const amounts = data
                .map((r: any) => Number(r.amount ?? 0))
                .filter((v: number) => !isNaN(v));
            const total = amounts.reduce((a: number, b: number) => a + b, 0);
            const count = amounts.length;

            content =
                `Toplam **${count}** adet ödeme kaydı bulundu ve bunların toplam tutarı ` +
                `**${total.toLocaleString('tr-TR')}** seviyesinde.`;
        }

        return {
            content,
            data,
            ui_component: action.display || 'table'
        };

    } catch (error: any) {
        console.error("Finance Action Error:", error);
        return {
            content: "Finans verisi işlenirken hata oluştu: " + error.message,
            data: null,
            ui_component: null
        };
    }
}

async function generateFinanceSummary(data: any[], userQuery: string): Promise<string> {
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
                        content: `Sen bir Finans Analisti'sin. Gelen finansal verileri analiz et ve kısa, profesyonel bir özet yaz.
                        
                        KURALLAR:
                        - Verileri tek tek listeleme (tablo zaten gösterilecek)
                        - Nakit akışı, gecikmiş faturalar ve önemli tutarları vurgula
                        - Sayısal verileri özetle (toplam, ortalama, en yüksek/düşük)
                        - **KRİTİK: Tüm sayısal verileri ve para birimlerini mutlaka KALIN (bold) formatta yaz (ör: **50.000 TL**).**
                        - Maksimum 3-4 cümle yaz
                        - Finans departmanı perspektifinden yaz`
                    },
                    {
                        role: "user",
                        content: `Kullanıcı Sorusu: ${userQuery}\n\nVeri: ${JSON.stringify(data).slice(0, 2000)}`
                    }
                ]
            })
        });

        const summaryData = await response.json();
        return summaryData.choices[0]?.message?.content || "Finans verileri hazır.";

    } catch (error) {
        return "**Finans Departmanı:** Veriler başarıyla getirildi.";
    }
}

