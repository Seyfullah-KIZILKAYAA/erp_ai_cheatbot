/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * FINANCE AGENT
 * Specialized in invoices, payments, cash/bank position and accounting KPIs.
 *
 * Intent-based architecture:
 * - invoice_list: Faturaları listele
 * - invoice_summary: Fatura özeti / istatistikleri
 * - payment_list: Ödemeleri listele
 * - payment_summary: Ödeme özeti
 * - unpaid_invoices: Ödenmemiş faturalar
 * - overdue_analysis: Vadesi geçmiş analiz
 * - payment_status: Ödeme durumu dağılımı (chart)
 * - revenue_breakdown: Gelir kırılımı grafiği
 */

import { searchReadOdoo, countOdoo, createOdoo } from "@/lib/odooClient";
import { withRetry, withTimeout } from "@/lib/utils/errorHandling";
import { extractWriteData } from "@/lib/utils/writeHelper";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type FinanceIntent =
    | "invoice_list"
    | "invoice_summary"
    | "payment_list"
    | "payment_summary"
    | "unpaid_invoices"
    | "overdue_analysis"
    | "payment_status"
    | "revenue_breakdown"
    | "create_invoice";

const INVOICE_FIELDS = ["id", "name", "partner_id", "amount_total", "payment_state", "state", "invoice_date"];
const PAYMENT_FIELDS = ["id", "name", "partner_id", "amount", "payment_type", "date", "state"];

const PAYMENT_STATE_LABELS: Record<string, string> = {
    not_paid: "Ödenmedi",
    in_payment: "Ödeme Sürecinde",
    paid: "Ödendi",
    partial: "Kısmi Ödeme",
    reversed: "İptal Edildi"
};

export async function processFinanceQuery(userQuery: string, history: any[], writeEnabled: boolean = false) {
    const lower = userQuery.toLowerCase();

    // --- Hard-coded intents for WRITE operations ---
    if (lower.includes("fatura oluştur") || lower.includes("fatura ekle") || lower.includes("yeni fatura")) {
        return executeFinanceAction("create_invoice", userQuery, writeEnabled);
    }

    // --- Hard-coded intents ---
    if (lower.includes("fatura listesi") || lower.includes("faturaları listele") || lower.includes("tüm faturaları")) {
        return executeFinanceAction("invoice_list", userQuery);
    }
    if (lower.includes("ödenmemiş fatura") || lower.includes("ödenmemiş") || lower.includes("borç")) {
        return executeFinanceAction("unpaid_invoices", userQuery);
    }
    if (lower.includes("ödeme listesi") || lower.includes("ödemeleri listele")) {
        return executeFinanceAction("payment_list", userQuery);
    }
    if (lower.includes("finans özet") || lower.includes("mali özet") || lower.includes("finans rapor") || lower.includes("fatura özet")) {
        return executeFinanceAction("invoice_summary", userQuery);
    }
    if (lower.includes("ödeme özet") || lower.includes("ödeme rapor")) {
        return executeFinanceAction("payment_summary", userQuery);
    }
    if (lower.includes("vadesi geçmiş") || lower.includes("gecikmiş")) {
        return executeFinanceAction("overdue_analysis", userQuery);
    }
    if (lower.includes("ödeme durum") || lower.includes("ödeme dağılım")) {
        return executeFinanceAction("payment_status", userQuery);
    }
    if (lower.includes("gelir kırılım") || lower.includes("fatura grafik")) {
        return executeFinanceAction("revenue_breakdown", userQuery);
    }

    // --- LLM-based intent detection ---
    const systemPrompt = `
    Sen bir **Finans ve Muhasebe AI Uzmanısın**. Odoo ERP'de faturalar, ödemeler ve finansal performansı analiz ediyorsun.

    MEVCUT ANALİZ TÜRLERİ:
    1. "invoice_list" → Faturaları listele
    2. "invoice_summary" → Fatura özeti ve istatistikleri
    3. "payment_list" → Ödemeleri listele
    4. "payment_summary" → Ödeme özeti ve nakit akışı
    5. "unpaid_invoices" → Ödenmemiş faturaları göster
    6. "overdue_analysis" → Vadesi geçmiş fatura analizi
    7. "payment_status" → Ödeme durumu dağılımı (grafik)
    8. "revenue_breakdown" → Gelir kırılımı grafiği

    ÇIKTI FORMATI:
    { "intent": "invoice_list", "reasoning": "Açıklama" }
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
                'Finance Agent LLM request timed out'
            ),
            { maxRetries: 2, baseDelay: 1000 }
        );

        if (!response.ok) {
            return { content: "Finans AI yanıt vermedi.", data: null, ui_component: null };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        let parsed: any;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
            else parsed = { intent: "invoice_summary" };
        }

        return executeFinanceAction(parsed.intent || "invoice_summary", userQuery, writeEnabled);

    } catch (error: any) {
        console.error("Finance Agent Error:", error);
        return executeFinanceAction("invoice_summary", userQuery);
    }
}

async function executeFinanceAction(intent: FinanceIntent, userQuery: string, writeEnabled: boolean = false) {
    try {
        switch (intent) {
            case "invoice_list": {
                const data = await searchReadOdoo(
                    "account.move", [["state", "=", "posted"]], INVOICE_FIELDS, 50, "invoice_date DESC"
                );
                if (!data?.length) {
                    return { content: "Sistemde onaylı fatura bulunamadı.", data: null, ui_component: null };
                }

                const total = data.reduce((s: number, r: any) => s + Number(r.amount_total || 0), 0);

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    fatura: r.name,
                    musteri: Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id,
                    tutar: Number(r.amount_total).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    odeme_durumu: PAYMENT_STATE_LABELS[r.payment_state] || r.payment_state,
                    tarih: r.invoice_date
                }));

                return {
                    content:
                        `## 🧾 Fatura Listesi\n\n` +
                        `Toplam **${data.length}** onaylı fatura listelendi.\n` +
                        `Toplam tutar: **${total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "invoice_summary": {
                const [totalInvoices, postedInvoices, draftInvoices, paidCount, unpaidCount] = await Promise.all([
                    countOdoo("account.move", []),
                    countOdoo("account.move", [["state", "=", "posted"]]),
                    countOdoo("account.move", [["state", "=", "draft"]]),
                    countOdoo("account.move", [["state", "=", "posted"], ["payment_state", "=", "paid"]]),
                    countOdoo("account.move", [["state", "=", "posted"], ["payment_state", "=", "not_paid"]])
                ]);

                const invoices = await searchReadOdoo(
                    "account.move", [["state", "=", "posted"]], ["amount_total"], 500, ""
                );
                const amounts = (invoices || []).map((r: any) => Number(r.amount_total || 0));
                const totalAmount = amounts.reduce((a: number, b: number) => a + b, 0);
                const avgAmount = amounts.length ? totalAmount / amounts.length : 0;
                const maxAmount = amounts.length ? Math.max(...amounts) : 0;
                const collectionRate = postedInvoices ? ((paidCount / postedInvoices) * 100).toFixed(1) : '0';

                return {
                    content:
                        `## 💰 Finans Departmanı Özeti\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Fatura | **${totalInvoices}** |\n` +
                        `| Onaylı Fatura | **${postedInvoices}** |\n` +
                        `| Taslak Fatura | **${draftInvoices}** |\n` +
                        `| Ödenen | **${paidCount}** |\n` +
                        `| Ödenmemiş | **${unpaidCount}** |\n` +
                        `| Toplam Tutar | **${totalAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Ort. Fatura | **${avgAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| En Yüksek Fatura | **${maxAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Tahsilat Oranı | **%${collectionRate}** |\n`,
                    data: { totalInvoices, postedInvoices, paidCount, unpaidCount, totalAmount },
                    ui_component: null
                };
            }

            case "payment_list": {
                const data = await searchReadOdoo("account.payment", [], PAYMENT_FIELDS, 50, "date DESC");
                if (!data?.length) {
                    return { content: "Sistemde ödeme kaydı bulunamadı.", data: null, ui_component: null };
                }
                const total = data.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    odeme: r.name,
                    musteri: Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id,
                    tutar: Number(r.amount).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    tip: r.payment_type === 'inbound' ? 'Tahsilat' : 'Ödeme',
                    durum: r.state,
                    tarih: r.date
                }));
                return {
                    content: `## 💳 Ödeme Listesi\n\nToplam **${data.length}** ödeme kaydı.\nToplam tutar: **${total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "payment_summary": {
                const payments = await searchReadOdoo("account.payment", [["state", "=", "posted"]], ["amount", "payment_type"], 500, "");
                const inbound = (payments || []).filter((p: any) => p.payment_type === 'inbound');
                const outbound = (payments || []).filter((p: any) => p.payment_type === 'outbound');
                const inboundTotal = inbound.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
                const outboundTotal = outbound.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
                const netFlow = inboundTotal - outboundTotal;

                return {
                    content:
                        `## 💳 Ödeme Özeti\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Tahsilat | **${inboundTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** (${inbound.length} adet) |\n` +
                        `| Toplam Ödeme | **${outboundTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** (${outbound.length} adet) |\n` +
                        `| Net Nakit Akışı | **${netFlow.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n\n` +
                        `${netFlow >= 0 ? 'Nakit akışı **pozitif** seyrediyor.' : '⚠️ Nakit akışı **negatif** — çıkışlar girişleri aşıyor.'}`,
                    data: { inboundTotal, outboundTotal, netFlow },
                    ui_component: null
                };
            }

            case "unpaid_invoices": {
                const data = await searchReadOdoo(
                    "account.move", [["state", "=", "posted"], ["payment_state", "=", "not_paid"]], INVOICE_FIELDS, 50, "amount_total DESC"
                );
                if (!data?.length) {
                    return { content: "Tüm faturalar ödenmiş durumda.", data: null, ui_component: null };
                }
                const total = data.reduce((s: number, r: any) => s + Number(r.amount_total || 0), 0);
                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1, fatura: r.name,
                    musteri: Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id,
                    tutar: Number(r.amount_total).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    tarih: r.invoice_date
                }));
                return {
                    content: `## 🚨 Ödenmemiş Faturalar\n\nToplam **${data.length}** ödenmemiş fatura.\nToplam alacak: **${total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "overdue_analysis": {
                const today = new Date().toISOString().split('T')[0];
                const data = await searchReadOdoo(
                    "account.move", [["state", "=", "posted"], ["payment_state", "=", "not_paid"], ["invoice_date", "<", today]], INVOICE_FIELDS, 50, "invoice_date ASC"
                );
                if (!data?.length) {
                    return { content: "Vadesi geçmiş fatura bulunmuyor.", data: null, ui_component: null };
                }
                const total = data.reduce((s: number, r: any) => s + Number(r.amount_total || 0), 0);
                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1, fatura: r.name,
                    musteri: Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id,
                    tutar: Number(r.amount_total).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    fatura_tarihi: r.invoice_date
                }));
                return {
                    content: `## ⏰ Vadesi Geçmiş Faturalar\n\n**${data.length}** adet faturanın vadesi geçmiş.\nGecikmiş tutar: **${total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**\n\nAcil tahsilat aksiyonu gerekli!`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "payment_status": {
                const states = ["not_paid", "in_payment", "paid", "partial"];
                const counts = await Promise.all(
                    states.map(s => countOdoo("account.move", [["state", "=", "posted"], ["payment_state", "=", s]]))
                );
                const chartData = states.map((s, i) => ({
                    name: PAYMENT_STATE_LABELS[s] || s,
                    fatura_sayisi: counts[i]
                })).filter(d => d.fatura_sayisi > 0);
                const total = counts.reduce((a, b) => a + b, 0);
                return {
                    content: `## 📊 Ödeme Durumu Dağılımı\n\nToplam **${total}** onaylı fatura:\n\n` +
                        chartData.map(d => `- **${d.name}**: ${d.fatura_sayisi} fatura`).join('\n'),
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            case "revenue_breakdown": {
                const data = await searchReadOdoo("account.move", [["state", "=", "posted"]], ["partner_id", "amount_total"], 200, "amount_total DESC");
                if (!data?.length) return { content: "Gelir kırılımı için yeterli veri yok.", data: null, ui_component: null };

                const revenueByPartner: Record<string, number> = {};
                data.forEach((r: any) => {
                    const name = Array.isArray(r.partner_id) ? r.partner_id[1] : String(r.partner_id);
                    revenueByPartner[name] = (revenueByPartner[name] || 0) + Number(r.amount_total || 0);
                });
                const chartData = Object.entries(revenueByPartner).sort((a, b) => b[1] - a[1]).slice(0, 10)
                    .map(([name, revenue]) => ({
                        name: name.length > 20 ? name.substring(0, 20) + '...' : name,
                        tutar: Math.round(revenue)
                    }));
                return {
                    content: `## 📊 Gelir Kırılımı (Top 10)\n\nEn yüksek fatura hacmi: **${chartData[0]?.name}** (**${chartData[0]?.tutar.toLocaleString('tr-TR')} ₺**)`,
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            // --- WRITE OPERATIONS ---
            case "create_invoice": {
                if (!writeEnabled) {
                    return {
                        content: "**Yazma izni kapalı.** Fatura oluşturmak için Ayarlar panelinden **Yazma İşlevi** seçeneğini aktif edin.",
                        data: null,
                        ui_component: null
                    };
                }

                const invoiceData = await extractWriteData(userQuery, `Kullanıcının mesajından fatura bilgilerini çıkar. JSON formatında döndür.
Alanlar: partner_name (müşteri adı, zorunlu), amount (tutar, opsiyonel).
Sadece JSON döndür, başka bir şey yazma.
Örnek: {"partner_name": "Acme Ltd", "amount": 5000}
Eğer müşteri adı bulunamadıysa {"partner_name": null} döndür.`);

                if (!invoiceData || !invoiceData.partner_name) {
                    return {
                        content: "Fatura oluşturmak için müşteri adı gerekli.\n\n**Örnek:**\n- \"Acme Ltd için yeni fatura oluştur\"\n- \"Test Şirketi adına 5000 TL fatura ekle\"",
                        data: null,
                        ui_component: null
                    };
                }

                const partners = await searchReadOdoo("res.partner", [["name", "ilike", invoiceData.partner_name]], ["id", "name"], 1);
                if (!partners?.length) {
                    return {
                        content: `"${invoiceData.partner_name}" adında müşteri bulunamadı. Önce müşteri oluşturun.`,
                        data: null,
                        ui_component: null
                    };
                }

                const newInvoiceId = await createOdoo("account.move", {
                    partner_id: partners[0].id,
                    move_type: "out_invoice"
                });

                const created = await searchReadOdoo("account.move", [["id", "=", newInvoiceId]], INVOICE_FIELDS, 1);

                return {
                    content:
                        `## Fatura Oluşturuldu!\n\n` +
                        `| Alan | Değer |\n|------|-------|\n` +
                        `| Fatura No | **${created[0]?.name || newInvoiceId}** |\n` +
                        `| Müşteri | **${partners[0].name}** |\n` +
                        `| Durum | **Taslak** |\n\n` +
                        `Fatura taslak olarak oluşturuldu. Kalem satırları Odoo'dan eklenebilir.`,
                    data: created,
                    ui_component: 'table'
                };
            }

            default:
                return executeFinanceAction("invoice_summary", userQuery);
        }

    } catch (error: any) {
        console.error("Finance Action Error:", error);
        if (error.message?.includes("ECONNREFUSED")) {
            return { content: "⚠️ Odoo ERP sistemine bağlanılamıyor. Lütfen Odoo servisinin (localhost:8069) çalıştığından emin olun.", data: null, ui_component: null };
        }
        return { content: "Finans verisi işlenirken hata oluştu: " + error.message, data: null, ui_component: null };
    }
}
