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

import { searchData, searchDataWithRelations, countData, getTables, getFields, getValue, getNumericValue, getField, getConnectionLabel, getConnectionErrorMessage, getRawValue } from "@/lib/dataAccess";
import { buildWriteConfirmationResponse } from "@/lib/utils/writeConfirmationHelper";
import { withRetry, withTimeout } from "@/lib/utils/errorHandling";
import { extractWriteData } from "@/lib/utils/writeHelper";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type FinanceIntent =
    | "invoice_list"
    | "invoice_summary"
    | "payment_list"
    | "payment_summary"
    | "payment_by_customer"
    | "unpaid_invoices"
    | "overdue_analysis"
    | "payment_status"
    | "revenue_breakdown"
    | "create_invoice"
    | "update_invoice";

// Dynamic field resolution
const getInvoiceFields = () => getFields('invoices', ['id', 'name', 'customer', 'totalAmount', 'paymentStatus', 'status', 'date']);
const getPaymentFields = () => getFields('payments', ['id', 'name', 'customer', 'amount', 'type', 'date', 'status']);

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

    if (lower.includes("fatura güncelle") || lower.includes("faturayı güncelle") || lower.includes("faturayı düzenle") || lower.includes("fatura bilgilerini değiştir")) {
        return executeFinanceAction("update_invoice", userQuery, writeEnabled);
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
    if (lower.includes("havale") || (lower.includes("ödeme") && lower.includes("müşteri")) || (lower.includes("ödeme") && lower.includes("kim"))) {
        return executeFinanceAction("payment_by_customer", userQuery);
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
    const connLabel = getConnectionLabel();
    const systemPrompt = `
    Sen bir **Finans ve Muhasebe AI Uzmanısın**. ${connLabel} sisteminde faturalar, ödemeler ve finansal performansı analiz ediyorsun.

    MEVCUT ANALİZ TÜRLERİ:
    1. "invoice_list" → Faturaları listele
    2. "invoice_summary" → Fatura özeti ve istatistikleri
    3. "payment_list" → Ödemeleri listele
    4. "payment_summary" → Ödeme özeti ve nakit akışı
    5. "payment_by_customer" → Müşteri bazlı ödeme/havale analizi (kim ne kadar ödedi, havale yapan müşteriler)
    6. "unpaid_invoices" → Ödenmemiş faturaları göster
    7. "overdue_analysis" → Vadesi geçmiş fatura analizi
    8. "payment_status" → Ödeme durumu dağılımı (grafik)
    9. "revenue_breakdown" → Gelir kırılımı grafiği
    10. "create_invoice" → Yeni fatura oluşturma
    11. "update_invoice" → Fatura bilgilerini güncelleme

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
                const data = await searchDataWithRelations(
                    getTables().invoices, [[getField('invoices', 'status'), "=", "posted"]], getInvoiceFields(), 50, `${getField('invoices', 'date')} DESC`
                );
                if (!data?.length) {
                    return { content: "Sistemde onaylı fatura bulunamadı.", data: null, ui_component: null };
                }

                const total = data.reduce((s: number, r: any) => s + getNumericValue(r, 'invoices', 'totalAmount'), 0);
                const customerField = getField('invoices', 'customer');

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    fatura: r.name,
                    musteri: r[`${customerField}_display`] || getValue(r, 'invoices', 'customer'),
                    tutar: getNumericValue(r, 'invoices', 'totalAmount').toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    odeme_durumu: PAYMENT_STATE_LABELS[getRawValue(r, 'invoices', 'paymentStatus')] || getValue(r, 'invoices', 'paymentStatus'),
                    tarih: r[getField('invoices', 'date')]
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
                    countData(getTables().invoices, []),
                    countData(getTables().invoices, [[getField('invoices', 'status'), "=", "posted"]]),
                    countData(getTables().invoices, [[getField('invoices', 'status'), "=", "draft"]]),
                    countData(getTables().invoices, [[getField('invoices', 'status'), "=", "posted"], [getField('invoices', 'paymentStatus'), "=", "paid"]]),
                    countData(getTables().invoices, [[getField('invoices', 'status'), "=", "posted"], [getField('invoices', 'paymentStatus'), "=", "not_paid"]])
                ]);

                const invoices = await searchData(
                    getTables().invoices, [[getField('invoices', 'status'), "=", "posted"]], [getField('invoices', 'totalAmount')], 500, ""
                );
                const amounts = (invoices || []).map((r: any) => getNumericValue(r, 'invoices', 'totalAmount'));
                const totalAmount = amounts.reduce((a: number, b: number) => a + b, 0);
                const avgAmount = amounts.length ? totalAmount / amounts.length : 0;
                const maxAmount = amounts.length ? Math.max(...amounts) : 0;
                const collectionRate = postedInvoices ? ((paidCount / postedInvoices) * 100).toFixed(1) : '0';

                return {
                    content:
                        `## 💰 Finans Departmanı Özeti\n\n` +
                        `Toplam **${totalInvoices}** fatura: **${postedInvoices}** onaylı, **${draftInvoices}** taslak.\n` +
                        `Ödeme durumu: **${paidCount}** ödendi, **${unpaidCount}** ödenmemiş.\n` +
                        `Toplam tutar **${totalAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**, ortalama **${avgAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**, en yüksek **${maxAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**.\n` +
                        `Tahsilat oranı: **%${collectionRate}**`,
                    data: { totalInvoices, postedInvoices, paidCount, unpaidCount, totalAmount },
                    ui_component: null
                };
            }

            case "payment_list": {
                const data = await searchDataWithRelations(getTables().payments, [], getPaymentFields(), 50, `${getField('payments', 'date')} DESC`);
                if (!data?.length) {
                    return { content: "Sistemde ödeme kaydı bulunamadı.", data: null, ui_component: null };
                }
                const total = data.reduce((s: number, r: any) => s + getNumericValue(r, 'payments', 'amount'), 0);
                const paymentCustomerField = getField('payments', 'customer');
                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    odeme: r.name,
                    musteri: r[`${paymentCustomerField}_display`] || getValue(r, 'payments', 'customer'),
                    tutar: getNumericValue(r, 'payments', 'amount').toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    tip: getRawValue(r, 'payments', 'type') === 'inbound' ? 'Tahsilat' : 'Ödeme',
                    durum: getRawValue(r, 'payments', 'status'),
                    tarih: r[getField('payments', 'date')]
                }));
                return {
                    content: `## 💳 Ödeme Listesi\n\nToplam **${data.length}** ödeme kaydı.\nToplam tutar: **${total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "payment_summary": {
                const payments = await searchData(getTables().payments, [[getField('payments', 'status'), "=", "posted"]], [getField('payments', 'amount'), getField('payments', 'type')], 500, "");
                const inbound = (payments || []).filter((p: any) => getRawValue(p, 'payments', 'type') === 'inbound');
                const outbound = (payments || []).filter((p: any) => getRawValue(p, 'payments', 'type') === 'outbound');
                const inboundTotal = inbound.reduce((s: number, p: any) => s + getNumericValue(p, 'payments', 'amount'), 0);
                const outboundTotal = outbound.reduce((s: number, p: any) => s + getNumericValue(p, 'payments', 'amount'), 0);
                const netFlow = inboundTotal - outboundTotal;

                return {
                    content:
                        `## 💳 Ödeme Özeti\n\n` +
                        `Toplam tahsilat **${inboundTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** (${inbound.length} adet), toplam ödeme **${outboundTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** (${outbound.length} adet).\n` +
                        `Net nakit akışı: **${netFlow.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**\n\n` +
                        `${netFlow >= 0 ? 'Nakit akışı **pozitif** seyrediyor.' : '⚠️ Nakit akışı **negatif** — çıkışlar girişleri aşıyor.'}`,
                    data: { inboundTotal, outboundTotal, netFlow },
                    ui_component: null
                };
            }

            case "payment_by_customer": {
                // Fetch all payments
                const payments = await searchData(getTables().payments, [], [], 500, '');
                if (!payments?.length) {
                    return { content: "Sistemde ödeme kaydı bulunamadı.", data: null, ui_component: null };
                }

                // Resolve customer names through FK chain:
                // Odemeler → FaturaID → Faturalar → SiparisID → Siparisler → MusteriID → Musteriler.MusteriAdi
                const customerNames: Map<number, string> = new Map();
                try {
                    // Step 1: Get all invoices linked from payments (FaturaID → Faturalar)
                    const invoiceTable = getTables().invoices;
                    const orderTable = getTables().salesOrders;
                    const customerTable = getTables().customers;

                    if (invoiceTable && orderTable && customerTable) {
                        const faturaIds = [...new Set(payments.map((p: any) => p.FaturaID).filter(Boolean))];
                        if (faturaIds.length > 0) {
                            const faturalar = await searchData(invoiceTable, [['FaturaID', 'in', faturaIds]], [], faturaIds.length, '');

                            // Step 2: Get all orders linked from invoices (SiparisID → Siparisler)
                            const siparisIds = [...new Set(faturalar.map((f: any) => f.SiparisID).filter(Boolean))];
                            if (siparisIds.length > 0) {
                                const siparisler = await searchData(orderTable, [[getField('salesOrders', 'id'), 'in', siparisIds]], [getField('salesOrders', 'id'), getField('salesOrders', 'customer')], siparisIds.length, '');

                                // Step 3: Get all customers (MusteriID → Musteriler)
                                const customerIdField = getField('salesOrders', 'customer');
                                const musteriIds = [...new Set(siparisler.map((s: any) => s[customerIdField]).filter(Boolean))];
                                if (musteriIds.length > 0) {
                                    const musteriler = await searchData(customerTable, [[getField('customers', 'id'), 'in', musteriIds]], [getField('customers', 'id'), getField('customers', 'name')], musteriIds.length, '');

                                    // Build lookup: MusteriID → MusteriAdi
                                    const musteriLookup = new Map<number, string>();
                                    for (const m of musteriler) {
                                        musteriLookup.set(m[getField('customers', 'id')], getValue(m, 'customers', 'name'));
                                    }

                                    // Build lookup: SiparisID → MusteriID
                                    const siparisLookup = new Map<number, number>();
                                    for (const s of siparisler) {
                                        siparisLookup.set(s[getField('salesOrders', 'id')], s[customerIdField]);
                                    }

                                    // Build lookup: FaturaID → SiparisID
                                    const faturaLookup = new Map<number, number>();
                                    for (const f of faturalar) {
                                        faturaLookup.set(f.FaturaID, f.SiparisID);
                                    }

                                    // Chain: Payment.FaturaID → Fatura.SiparisID → Siparis.MusteriID → Musteri.MusteriAdi
                                    for (const p of payments) {
                                        const faturaId = p.FaturaID;
                                        const siparisId = faturaLookup.get(faturaId);
                                        const musteriId = siparisId ? siparisLookup.get(siparisId) : undefined;
                                        const musteriAdi = musteriId ? musteriLookup.get(musteriId) : undefined;
                                        if (musteriAdi) customerNames.set(p.OdemeID, musteriAdi);
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.warn('[FINANCE] FK chain resolution failed:', err);
                }

                // Group by customer
                const customerTotals: Record<string, { name: string; total: number; count: number }> = {};
                for (const p of payments) {
                    const amountField = getField('payments', 'amount');
                    const amount = Number(p[amountField] || p.OdemeTutari || 0);
                    const customerName = customerNames.get(p.OdemeID) || 'Bilinmeyen';

                    if (!customerTotals[customerName]) {
                        customerTotals[customerName] = { name: customerName, total: 0, count: 0 };
                    }
                    customerTotals[customerName].total += amount;
                    customerTotals[customerName].count++;
                }

                const sorted = Object.values(customerTotals).sort((a, b) => b.total - a.total);
                const grandTotal = sorted.reduce((s, c) => s + c.total, 0);

                const tableData = sorted.map((c, i) => ({
                    sira: i + 1,
                    musteri: c.name,
                    odeme_sayisi: c.count,
                    toplam_tutar: c.total.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺'
                }));

                return {
                    content:
                        `## 💳 Müşteri Bazlı Ödeme Analizi\n\n` +
                        `**${sorted.length}** müşteriden toplam **${payments.length}** ödeme, **${grandTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**.`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "unpaid_invoices": {
                const data = await searchDataWithRelations(
                    getTables().invoices, [[getField('invoices', 'status'), "=", "posted"], [getField('invoices', 'paymentStatus'), "=", "not_paid"]], getInvoiceFields(), 50, `${getField('invoices', 'totalAmount')} DESC`
                );
                if (!data?.length) {
                    return { content: "Tüm faturalar ödenmiş durumda.", data: null, ui_component: null };
                }
                const total = data.reduce((s: number, r: any) => s + getNumericValue(r, 'invoices', 'totalAmount'), 0);
                const unpaidCustomerField = getField('invoices', 'customer');
                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1, fatura: r.name,
                    musteri: r[`${unpaidCustomerField}_display`] || getValue(r, 'invoices', 'customer'),
                    tutar: getNumericValue(r, 'invoices', 'totalAmount').toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    tarih: r[getField('invoices', 'date')]
                }));
                return {
                    content: `## 🚨 Ödenmemiş Faturalar\n\nToplam **${data.length}** ödenmemiş fatura.\nToplam alacak: **${total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "overdue_analysis": {
                const today = new Date().toISOString().split('T')[0];
                const data = await searchData(
                    getTables().invoices, [[getField('invoices', 'status'), "=", "posted"], [getField('invoices', 'paymentStatus'), "=", "not_paid"], [getField('invoices', 'date'), "<", today]], getInvoiceFields(), 50, `${getField('invoices', 'date')} ASC`
                );
                if (!data?.length) {
                    return { content: "Vadesi geçmiş fatura bulunmuyor.", data: null, ui_component: null };
                }
                const total = data.reduce((s: number, r: any) => s + getNumericValue(r, 'invoices', 'totalAmount'), 0);
                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1, fatura: r.name,
                    musteri: getValue(r, 'invoices', 'customer'),
                    tutar: getNumericValue(r, 'invoices', 'totalAmount').toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    fatura_tarihi: r[getField('invoices', 'date')]
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
                    states.map(s => countData(getTables().invoices, [[getField('invoices', 'status'), "=", "posted"], [getField('invoices', 'paymentStatus'), "=", s]]))
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
                const data = await searchData(getTables().invoices, [[getField('invoices', 'status'), "=", "posted"]], [getField('invoices', 'customer'), getField('invoices', 'totalAmount')], 200, `${getField('invoices', 'totalAmount')} DESC`);
                if (!data?.length) return { content: "Gelir kırılımı için yeterli veri yok.", data: null, ui_component: null };

                const revenueByPartner: Record<string, number> = {};
                data.forEach((r: any) => {
                    const name = getValue(r, 'invoices', 'customer');
                    revenueByPartner[name] = (revenueByPartner[name] || 0) + getNumericValue(r, 'invoices', 'totalAmount');
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

            // --- WRITE OPERATIONS (Onay sistemi ile) ---
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

                return buildWriteConfirmationResponse('create_invoice', 'finance', invoiceData);
            }

            case "update_invoice": {
                if (!writeEnabled) {
                    return {
                        content: "**Yazma izni kapalı.** Fatura güncellemek için Ayarlar panelinden **Yazma İşlevi** seçeneğini aktif edin.",
                        data: null,
                        ui_component: null
                    };
                }

                const updateData = await extractWriteData(userQuery, `Kullanıcının mesajından fatura güncelleme bilgilerini çıkar. JSON formatında döndür.
Alanlar: invoice_name (güncellenecek faturanın numarası, zorunlu), partner_name (yeni müşteri adı).
Sadece değişecek alanları ekle. Değişmeyen alanları ekleme.
Sadece JSON döndür, başka bir şey yazma.
Örnek: {"invoice_name": "INV/2024/00001", "partner_name": "Acme Ltd"}
Eğer fatura numarası bulunamadıysa {"invoice_name": null} döndür.`);
                if (!updateData || !updateData.invoice_name) {
                    return {
                        content: "Fatura güncellemek için fatura numarası gerekli.\n\n**Örnek:**\n- \"INV/2024/00001 faturasının müşterisini Acme Ltd olarak güncelle\"",
                        data: null,
                        ui_component: null
                    };
                }

                return buildWriteConfirmationResponse('update_invoice', 'finance', updateData);
            }

            default:
                return executeFinanceAction("invoice_summary", userQuery);
        }

    } catch (error: any) {
        console.error("Finance Action Error:", error);
        if (error.message?.includes("ECONNREFUSED")) {
            return { content: getConnectionErrorMessage(), data: null, ui_component: null };
        }
        return { content: "Finans verisi işlenirken hata oluştu: " + error.message, data: null, ui_component: null };
    }
}
