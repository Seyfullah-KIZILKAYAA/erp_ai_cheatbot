/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * SALES AGENT
 * Specialized in sales orders, quotations, customer relationships, and revenue analysis.
 * Connects to Odoo ERP via XML-RPC for real-time data.
 *
 * Intent-based architecture:
 * - order_list: Satış siparişlerini listele
 * - order_summary: Satış özeti / istatistikleri
 * - customer_list: Müşteri portföyü
 * - customer_search: Müşteri arama
 * - quotation_list: Taslak teklifler
 * - top_orders: En yüksek tutarlı siparişler
 * - order_status: Durum bazlı sipariş analizi
 * - revenue_chart: Gelir dağılımı grafiği
 */

import { searchReadOdoo, countOdoo } from "@/lib/odooClient";
import { withRetry, withTimeout } from "@/lib/utils/errorHandling";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type SalesIntent =
    | "order_list"
    | "order_summary"
    | "customer_list"
    | "customer_search"
    | "quotation_list"
    | "top_orders"
    | "order_status"
    | "revenue_chart";

const SALE_ORDER_FIELDS = ["id", "name", "partner_id", "amount_total", "state", "date_order"];
const PARTNER_FIELDS = ["id", "name", "email", "phone", "city", "is_company"];

const STATE_LABELS: Record<string, string> = {
    draft: "Taslak",
    sent: "Gönderildi",
    sale: "Onaylı Satış",
    done: "Tamamlandı",
    cancel: "İptal"
};

export async function processSalesQuery(userQuery: string, history: any[]) {
    const lower = userQuery.toLowerCase();

    // --- Hard-coded intents for common queries ---
    if (lower.includes("tüm müşterileri listele") || lower.includes("müşteri listesi")) {
        return executeSalesAction("customer_list", userQuery);
    }
    if (lower.includes("satış siparişlerini listele") || lower.includes("sipariş listesi")) {
        return executeSalesAction("order_list", userQuery);
    }
    if (lower.includes("taslak teklifleri listele") || lower.includes("taslak teklif")) {
        return executeSalesAction("quotation_list", userQuery);
    }
    if (lower.includes("en yüksek sipariş") || lower.includes("en büyük satış") || lower.includes("top sipariş")) {
        return executeSalesAction("top_orders", userQuery);
    }
    if (lower.includes("satış özet") || lower.includes("satış rapor") || lower.includes("satış durumu")) {
        return executeSalesAction("order_summary", userQuery);
    }
    if (lower.includes("sipariş durum") || lower.includes("durum dağılım")) {
        return executeSalesAction("order_status", userQuery);
    }
    if (lower.includes("gelir grafik") || lower.includes("satış grafik") || lower.includes("gelir dağılım")) {
        return executeSalesAction("revenue_chart", userQuery);
    }
    if (lower.includes("crm fırsat")) {
        return {
            content: "Bu istek CRM ajanı tarafından işlendiği için satış tarafında ek veri getirilmedi.",
            data: null,
            ui_component: null
        };
    }

    // --- LLM-based intent detection for ambiguous queries ---
    const systemPrompt = `
    Sen bir **Satış Departmanı AI Uzmanısın**. Odoo ERP sisteminde satış siparişleri, müşteri verileri ve gelir analizlerini yönetiyorsun.

    MEVCUT ANALİZ TÜRLERİ:
    1. "order_list" → Satış siparişlerini listele
    2. "order_summary" → Satış özeti ve istatistikleri (toplam, ortalama, min/max)
    3. "customer_list" → Tüm müşterileri listele
    4. "customer_search" → Belirli bir müşteriyi ara (filters kullan)
    5. "quotation_list" → Taslak teklifleri listele
    6. "top_orders" → En yüksek tutarlı siparişler
    7. "order_status" → Durum bazlı sipariş dağılımı
    8. "revenue_chart" → Gelir dağılımı grafiği

    KURALLAR:
    - SADECE GEÇERLİ JSON formatında yanıt ver.
    - Eğer müşteri aranıyorsa, "search_term" alanına arama terimini ekle.
    - Bugün: ${new Date().toISOString().split('T')[0]}

    ÇIKTI FORMATI:
    {
        "intent": "order_list",
        "search_term": null,
        "reasoning": "Kullanıcı satış siparişlerini görmek istiyor."
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
                        max_tokens: 400,
                        response_format: { type: "json_object" }
                    })
                }),
                12000,
                'Sales Agent LLM request timed out'
            ),
            { maxRetries: 2, baseDelay: 1000 }
        );

        if (!response.ok) {
            return { content: "Satış AI servisinden yanıt alınamadı.", data: null, ui_component: null };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        let parsed: any;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
            else parsed = { intent: "order_list" };
        }

        return executeSalesAction(parsed.intent || "order_list", userQuery, parsed.search_term);

    } catch (error: any) {
        console.error("Sales Agent Error:", error);
        return executeSalesAction("order_summary", userQuery);
    }
}

async function executeSalesAction(intent: SalesIntent, userQuery: string, searchTerm?: string) {
    try {
        switch (intent) {
            case "order_list": {
                const data = await searchReadOdoo(
                    "sale.order", [], SALE_ORDER_FIELDS, 50, "date_order DESC"
                );
                if (!data?.length) {
                    return { content: "Sistemde satış siparişi bulunamadı.", data: null, ui_component: null };
                }

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    siparis: r.name,
                    musteri: Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id,
                    tutar: Number(r.amount_total).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    durum: STATE_LABELS[r.state] || r.state,
                    tarih: r.date_order
                }));

                const total = data.reduce((s: number, r: any) => s + Number(r.amount_total || 0), 0);

                return {
                    content:
                        `## 📋 Satış Siparişleri\n\n` +
                        `Toplam **${data.length}** sipariş listelendi.\n` +
                        `Toplam tutar: **${total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "order_summary": {
                const [totalOrders, confirmedOrders, draftOrders, cancelledOrders] = await Promise.all([
                    countOdoo("sale.order", []),
                    countOdoo("sale.order", [["state", "=", "sale"]]),
                    countOdoo("sale.order", [["state", "=", "draft"]]),
                    countOdoo("sale.order", [["state", "=", "cancel"]])
                ]);

                const recentOrders = await searchReadOdoo(
                    "sale.order", [["state", "=", "sale"]], ["amount_total"], 500, ""
                );

                const amounts = (recentOrders || []).map((r: any) => Number(r.amount_total || 0));
                const totalRevenue = amounts.reduce((a: number, b: number) => a + b, 0);
                const avgOrder = amounts.length ? totalRevenue / amounts.length : 0;
                const maxOrder = amounts.length ? Math.max(...amounts) : 0;
                const minOrder = amounts.length ? Math.min(...amounts) : 0;

                return {
                    content:
                        `## 💼 Satış Departmanı Özeti\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Sipariş | **${totalOrders}** |\n` +
                        `| Onaylı Satış | **${confirmedOrders}** |\n` +
                        `| Taslak Teklif | **${draftOrders}** |\n` +
                        `| İptal Edilen | **${cancelledOrders}** |\n` +
                        `| Toplam Gelir | **${totalRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Ort. Sipariş Tutarı | **${avgOrder.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| En Yüksek Sipariş | **${maxOrder.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| En Düşük Sipariş | **${minOrder.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n\n` +
                        `Onay oranı: **%${totalOrders ? ((confirmedOrders / totalOrders) * 100).toFixed(1) : 0}**`,
                    data: { totalOrders, confirmedOrders, draftOrders, cancelledOrders, totalRevenue, avgOrder },
                    ui_component: null
                };
            }

            case "customer_list": {
                const data = await searchReadOdoo(
                    "res.partner", [], PARTNER_FIELDS, 100, "name ASC"
                );
                if (!data?.length) {
                    return { content: "Sistemde müşteri kaydı bulunamadı.", data: null, ui_component: null };
                }

                const companyCount = data.filter((r: any) => r.is_company).length;
                const individualCount = data.length - companyCount;
                const cityCounts: Record<string, number> = {};
                data.forEach((r: any) => {
                    const city = r.city || 'Belirtilmemiş';
                    cityCounts[city] = (cityCounts[city] || 0) + 1;
                });
                const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0];

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    ad: r.name,
                    email: r.email || '-',
                    telefon: r.phone || '-',
                    sehir: r.city || '-',
                    tip: r.is_company ? 'Şirket' : 'Bireysel'
                }));

                return {
                    content:
                        `## 👥 Müşteri Portföyü\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Müşteri | **${data.length}** |\n` +
                        `| Şirket | **${companyCount}** |\n` +
                        `| Bireysel | **${individualCount}** |\n` +
                        `| En Yoğun Şehir | **${topCity ? `${topCity[0]} (${topCity[1]})` : '-'}** |\n`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "customer_search": {
                const term = searchTerm || userQuery;
                const data = await searchReadOdoo(
                    "res.partner",
                    [["name", "ilike", term]],
                    PARTNER_FIELDS, 20, "name ASC"
                );
                if (!data?.length) {
                    return { content: `"${term}" ile eşleşen müşteri bulunamadı.`, data: null, ui_component: null };
                }

                const tableData = data.map((r: any) => ({
                    ad: r.name,
                    email: r.email || '-',
                    telefon: r.phone || '-',
                    sehir: r.city || '-',
                    tip: r.is_company ? 'Şirket' : 'Bireysel'
                }));

                return {
                    content: `## 🔍 Müşteri Arama: "${term}"\n\n**${data.length}** sonuç bulundu.`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "quotation_list": {
                const data = await searchReadOdoo(
                    "sale.order",
                    [["state", "=", "draft"]],
                    SALE_ORDER_FIELDS, 50, "date_order DESC"
                );
                if (!data?.length) {
                    return { content: "Sistemde taslak teklif bulunmuyor.", data: null, ui_component: null };
                }

                const total = data.reduce((s: number, r: any) => s + Number(r.amount_total || 0), 0);

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    teklif: r.name,
                    musteri: Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id,
                    tutar: Number(r.amount_total).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    tarih: r.date_order
                }));

                return {
                    content:
                        `## 📝 Taslak Teklifler\n\n` +
                        `Toplam **${data.length}** taslak teklif mevcut.\n` +
                        `Potansiyel toplam tutar: **${total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**\n\n` +
                        `Bu teklifler onaylanmayı bekliyor.`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "top_orders": {
                const data = await searchReadOdoo(
                    "sale.order",
                    [["state", "=", "sale"]],
                    SALE_ORDER_FIELDS, 10, "amount_total DESC"
                );
                if (!data?.length) {
                    return { content: "Onaylı satış siparişi bulunamadı.", data: null, ui_component: null };
                }

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    siparis: r.name,
                    musteri: Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id,
                    tutar: Number(r.amount_total).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    tarih: r.date_order
                }));

                return {
                    content:
                        `## 🏆 En Yüksek Tutarlı Siparişler (Top 10)\n\n` +
                        `En büyük sipariş: **${data[0].name}** — ` +
                        `**${Number(data[0].amount_total).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "order_status": {
                const states = ["draft", "sent", "sale", "done", "cancel"];
                const counts = await Promise.all(
                    states.map(s => countOdoo("sale.order", [["state", "=", s]]))
                );

                const chartData = states.map((s, i) => ({
                    name: STATE_LABELS[s] || s,
                    siparis_sayisi: counts[i]
                })).filter(d => d.siparis_sayisi > 0);

                const total = counts.reduce((a, b) => a + b, 0);

                const statusLines = chartData.map(d =>
                    `- **${d.name}**: ${d.siparis_sayisi} sipariş (%${total ? ((d.siparis_sayisi / total) * 100).toFixed(1) : 0})`
                ).join('\n');

                return {
                    content:
                        `## 📊 Sipariş Durum Dağılımı\n\n` +
                        `Toplam **${total}** sipariş:\n\n${statusLines}`,
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            case "revenue_chart": {
                const data = await searchReadOdoo(
                    "sale.order",
                    [["state", "=", "sale"]],
                    ["partner_id", "amount_total"], 100, "amount_total DESC"
                );
                if (!data?.length) {
                    return { content: "Gelir grafiği için yeterli veri bulunamadı.", data: null, ui_component: null };
                }

                // Müşteri bazlı gelir grupla
                const revenueByCustomer: Record<string, number> = {};
                data.forEach((r: any) => {
                    const name = Array.isArray(r.partner_id) ? r.partner_id[1] : String(r.partner_id);
                    revenueByCustomer[name] = (revenueByCustomer[name] || 0) + Number(r.amount_total || 0);
                });

                const chartData = Object.entries(revenueByCustomer)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([name, revenue]) => ({
                        name: name.length > 20 ? name.substring(0, 20) + '...' : name,
                        gelir: Math.round(revenue)
                    }));

                return {
                    content:
                        `## 📈 Müşteri Bazlı Gelir Dağılımı (Top 10)\n\n` +
                        `En çok gelir getiren müşteri: **${chartData[0]?.name}** ` +
                        `(**${chartData[0]?.gelir.toLocaleString('tr-TR')} ₺**)`,
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            default:
                return executeSalesAction("order_list", userQuery);
        }

    } catch (error: any) {
        console.error("Sales Action Error:", error);

        if (error.message?.includes("ECONNREFUSED")) {
            return {
                content: "⚠️ Odoo ERP sistemine bağlanılamıyor. Lütfen Odoo servisinin (localhost:8069) çalıştığından emin olun.",
                data: null,
                ui_component: null
            };
        }

        return {
            content: "Satış verisi işlenirken hata oluştu: " + error.message,
            data: null,
            ui_component: null
        };
    }
}
