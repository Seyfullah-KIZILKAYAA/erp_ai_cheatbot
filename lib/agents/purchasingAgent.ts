/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PURCHASING AGENT
 * Specialized in purchase orders, vendors and procurement KPIs.
 *
 * Intent-based architecture:
 * - po_list: Satın alma siparişlerini listele
 * - po_summary: Satın alma özeti / istatistikleri
 * - pending_orders: Bekleyen / onay bekleyen siparişler
 * - vendor_list: Tedarikçi listesi
 * - vendor_search: Tedarikçi arama
 * - top_vendors: En çok alım yapılan tedarikçiler (chart)
 * - po_status: Sipariş durum dağılımı (chart)
 * - top_purchases: En yüksek tutarlı satın almalar
 */

import { searchData, countData, getTables, getFields, getValue, getNumericValue, getField, getConnectionLabel, getConnectionErrorMessage, getRawValue } from "@/lib/dataAccess";
import { buildWriteConfirmationResponse } from "@/lib/utils/writeConfirmationHelper";
import { withRetry, withTimeout } from "@/lib/utils/errorHandling";
import { extractWriteData } from "@/lib/utils/writeHelper";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type PurchasingIntent =
    | "po_list"
    | "po_summary"
    | "pending_orders"
    | "vendor_list"
    | "vendor_search"
    | "top_vendors"
    | "po_status"
    | "top_purchases"
    | "create_purchase"
    | "update_purchase";

// Dynamic field resolution - adapts to connected database
const getPOFields = () => getFields('purchaseOrders', ['id', 'name', 'vendor', 'totalAmount', 'status', 'date']);
const getVendorFields = () => getFields('customers', ['id', 'name', 'email', 'phone', 'city', 'isCompany']);

const PO_STATE_LABELS: Record<string, string> = {
    draft: "Taslak (RFQ)",
    sent: "Gönderildi",
    to_approve: "Onay Bekliyor",
    purchase: "Onaylı Sipariş",
    done: "Tamamlandı",
    cancel: "İptal"
};

export async function processPurchasingQuery(userQuery: string, history: any[], writeEnabled: boolean = false) {
    const lower = userQuery.toLowerCase();

    // --- Hard-coded intents for WRITE operations ---
    if (lower.includes("satın alma oluştur") || lower.includes("satın alma ekle") || lower.includes("yeni satın alma") || lower.includes("po oluştur")) {
        return executePurchasingAction("create_purchase", userQuery, undefined, writeEnabled);
    }

    if (lower.includes("satın alma güncelle") || lower.includes("satın almayı güncelle") || lower.includes("po güncelle") || lower.includes("satın almayı düzenle")) {
        return executePurchasingAction("update_purchase", userQuery, undefined, writeEnabled);
    }

    // --- Hard-coded intents ---
    if (lower.includes("satın alma siparişlerini listele") || lower.includes("po listesi") || lower.includes("tüm satın almaları")) {
        return executePurchasingAction("po_list", userQuery);
    }
    if (lower.includes("bekleyen satın alma") || lower.includes("onay bekleyen") || lower.includes("bekleyen sipariş")) {
        return executePurchasingAction("pending_orders", userQuery);
    }
    if (lower.includes("tedarikçi listesi") || lower.includes("tedarikçileri listele") || lower.includes("tüm tedarikçi")) {
        return executePurchasingAction("vendor_list", userQuery);
    }
    if (lower.includes("satın alma özet") || lower.includes("satın alma rapor") || lower.includes("alım özet")) {
        return executePurchasingAction("po_summary", userQuery);
    }
    if (lower.includes("en çok alım") || lower.includes("top tedarikçi") || lower.includes("en büyük tedarikçi")) {
        return executePurchasingAction("top_vendors", userQuery);
    }
    if (lower.includes("en yüksek alım") || lower.includes("en büyük satın alma")) {
        return executePurchasingAction("top_purchases", userQuery);
    }
    if (lower.includes("alım durum") || lower.includes("sipariş durum dağılım")) {
        return executePurchasingAction("po_status", userQuery);
    }

    // --- LLM-based intent detection ---
    const connLabel = getConnectionLabel();
    const systemPrompt = `
    Sen bir **Satın Alma ve Tedarik Zinciri AI Uzmanısın**. ${connLabel} sisteminde satın alma siparişleri ve tedarikçi yönetimi yapıyorsun.

    MEVCUT ANALİZ TÜRLERİ:
    1. "po_list" → Satın alma siparişlerini listele
    2. "po_summary" → Satın alma özeti ve istatistikleri
    3. "pending_orders" → Bekleyen / onay bekleyen siparişler
    4. "vendor_list" → Tedarikçi listesi
    5. "vendor_search" → Tedarikçi arama
    6. "top_vendors" → En çok alım yapılan tedarikçiler (grafik)
    7. "po_status" → Sipariş durum dağılımı (grafik)
    8. "top_purchases" → En yüksek tutarlı satın almalar
    9. "create_purchase" → Yeni satın alma siparişi oluşturma
    10. "update_purchase" → Satın alma siparişini güncelleme

    ÇIKTI FORMATI:
    { "intent": "po_list", "search_term": null, "reasoning": "Açıklama" }
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
                'Purchasing Agent LLM request timed out'
            ),
            { maxRetries: 2, baseDelay: 1000 }
        );

        if (!response.ok) {
            return { content: "Satın alma AI yanıt vermedi.", data: null, ui_component: null };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        let parsed: any;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
            else parsed = { intent: "po_list" };
        }

        return executePurchasingAction(parsed.intent || "po_list", userQuery, parsed.search_term, writeEnabled);

    } catch (error: any) {
        console.error("Purchasing Agent Error:", error);
        return executePurchasingAction("po_summary", userQuery);
    }
}

async function executePurchasingAction(intent: PurchasingIntent, userQuery: string, searchTerm?: string, writeEnabled: boolean = false) {
    try {
        switch (intent) {
            case "po_list": {
                const data = await searchData(getTables().purchaseOrders, [], getPOFields(), 50, `${getField('purchaseOrders', 'date')} DESC`);
                if (!data?.length) {
                    return { content: "Sistemde satın alma siparişi bulunamadı.", data: null, ui_component: null };
                }

                const total = data.reduce((s: number, r: any) => s + getNumericValue(r, 'purchaseOrders', 'totalAmount'), 0);
                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    siparis: getValue(r, 'purchaseOrders', 'name'),
                    tedarikci: getValue(r, 'purchaseOrders', 'vendor'),
                    tutar: getNumericValue(r, 'purchaseOrders', 'totalAmount').toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    durum: PO_STATE_LABELS[getRawValue(r, 'purchaseOrders', 'status')] || getValue(r, 'purchaseOrders', 'status'),
                    tarih: getValue(r, 'purchaseOrders', 'date')
                }));

                return {
                    content:
                        `## 🧾 Satın Alma Siparişleri\n\n` +
                        `Toplam **${data.length}** sipariş listelendi.\n` +
                        `Toplam tutar: **${total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "po_summary": {
                const [totalPO, confirmedPO, draftPO, cancelledPO] = await Promise.all([
                    countData(getTables().purchaseOrders, []),
                    countData(getTables().purchaseOrders, [[getField('purchaseOrders', 'status'), "=", "purchase"]]),
                    countData(getTables().purchaseOrders, [[getField('purchaseOrders', 'status'), "=", "draft"]]),
                    countData(getTables().purchaseOrders, [[getField('purchaseOrders', 'status'), "=", "cancel"]])
                ]);

                const orders = await searchData(
                    getTables().purchaseOrders, [[getField('purchaseOrders', 'status'), "=", "purchase"]], [getField('purchaseOrders', 'totalAmount')], 500, ""
                );
                const amounts = (orders || []).map((r: any) => getNumericValue(r, 'purchaseOrders', 'totalAmount'));
                const totalAmount = amounts.reduce((a: number, b: number) => a + b, 0);
                const avgAmount = amounts.length ? totalAmount / amounts.length : 0;
                const maxAmount = amounts.length ? Math.max(...amounts) : 0;
                const minAmount = amounts.length ? Math.min(...amounts) : 0;

                const vendorCount = await countData(getTables().customers, [[getField('customers', 'isCompany'), "=", true]]);

                return {
                    content:
                        `## 🧾 Satın Alma Departmanı Özeti\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Sipariş | **${totalPO}** |\n` +
                        `| Onaylı Sipariş | **${confirmedPO}** |\n` +
                        `| Taslak (RFQ) | **${draftPO}** |\n` +
                        `| İptal Edilen | **${cancelledPO}** |\n` +
                        `| Toplam Harcama | **${totalAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Ort. Sipariş Tutarı | **${avgAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| En Yüksek Sipariş | **${maxAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| En Düşük Sipariş | **${minAmount.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Kayıtlı Tedarikçi | **${vendorCount}** |\n`,
                    data: { totalPO, confirmedPO, draftPO, totalAmount, vendorCount },
                    ui_component: null
                };
            }

            case "pending_orders": {
                const data = await searchData(
                    getTables().purchaseOrders,
                    [[getField('purchaseOrders', 'status'), "in", ["draft", "sent", "to approve"]]],
                    getPOFields(), 50, `${getField('purchaseOrders', 'date')} DESC`
                );
                if (!data?.length) {
                    return { content: "Bekleyen satın alma siparişi bulunmuyor.", data: null, ui_component: null };
                }

                const total = data.reduce((s: number, r: any) => s + getNumericValue(r, 'purchaseOrders', 'totalAmount'), 0);
                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    siparis: getValue(r, 'purchaseOrders', 'name'),
                    tedarikci: getValue(r, 'purchaseOrders', 'vendor'),
                    tutar: getNumericValue(r, 'purchaseOrders', 'totalAmount').toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    durum: PO_STATE_LABELS[getRawValue(r, 'purchaseOrders', 'status')] || getValue(r, 'purchaseOrders', 'status'),
                    tarih: getValue(r, 'purchaseOrders', 'date')
                }));

                return {
                    content:
                        `## ⏳ Bekleyen Satın Alma Siparişleri\n\n` +
                        `**${data.length}** sipariş onay bekliyor.\n` +
                        `Bekleyen toplam tutar: **${total.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "vendor_list": {
                const data = await searchData(
                    getTables().customers, [[getField('customers', 'isCompany'), "=", true]], getVendorFields(), 100, `${getField('customers', 'name')} ASC`
                );
                if (!data?.length) {
                    return { content: "Sistemde tedarikçi kaydı bulunamadı.", data: null, ui_component: null };
                }

                const cityCounts: Record<string, number> = {};
                data.forEach((r: any) => {
                    const city = getValue(r, 'customers', 'city', 'Belirtilmemiş');
                    cityCounts[city] = (cityCounts[city] || 0) + 1;
                });
                const topCity = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])[0];

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    ad: getValue(r, 'customers', 'name'),
                    email: getValue(r, 'customers', 'email') || '-',
                    telefon: getValue(r, 'customers', 'phone') || '-',
                    sehir: getValue(r, 'customers', 'city') || '-'
                }));

                return {
                    content:
                        `## 🏢 Tedarikçi Listesi\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Tedarikçi | **${data.length}** |\n` +
                        `| En Yoğun Şehir | **${topCity ? `${topCity[0]} (${topCity[1]})` : '-'}** |\n`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "vendor_search": {
                const term = searchTerm || userQuery;
                const data = await searchData(
                    getTables().customers, [[getField('customers', 'name'), "ilike", term], [getField('customers', 'isCompany'), "=", true]], getVendorFields(), 20, `${getField('customers', 'name')} ASC`
                );
                if (!data?.length) {
                    return { content: `"${term}" ile eşleşen tedarikçi bulunamadı.`, data: null, ui_component: null };
                }

                const tableData = data.map((r: any) => ({
                    ad: getValue(r, 'customers', 'name'), email: getValue(r, 'customers', 'email') || '-', telefon: getValue(r, 'customers', 'phone') || '-', sehir: getValue(r, 'customers', 'city') || '-'
                }));

                return {
                    content: `## 🔍 Tedarikçi Arama: "${term}"\n\n**${data.length}** sonuç bulundu.`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "top_vendors": {
                const data = await searchData(
                    getTables().purchaseOrders, [[getField('purchaseOrders', 'status'), "=", "purchase"]], [getField('purchaseOrders', 'vendor'), getField('purchaseOrders', 'totalAmount')], 200, `${getField('purchaseOrders', 'totalAmount')} DESC`
                );
                if (!data?.length) {
                    return { content: "Tedarikçi analizi için yeterli veri yok.", data: null, ui_component: null };
                }

                const spendByVendor: Record<string, number> = {};
                data.forEach((r: any) => {
                    const name = getValue(r, 'purchaseOrders', 'vendor');
                    spendByVendor[name] = (spendByVendor[name] || 0) + getNumericValue(r, 'purchaseOrders', 'totalAmount');
                });

                const chartData = Object.entries(spendByVendor)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
                    .map(([name, spend]) => ({
                        name: name.length > 20 ? name.substring(0, 20) + '...' : name,
                        harcama: Math.round(spend)
                    }));

                return {
                    content:
                        `## 🏆 En Çok Alım Yapılan Tedarikçiler (Top 10)\n\n` +
                        `En yüksek hacimli tedarikçi: **${chartData[0]?.name}** ` +
                        `(**${chartData[0]?.harcama.toLocaleString('tr-TR')} ₺**)`,
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            case "po_status": {
                const states = ["draft", "sent", "to_approve", "purchase", "done", "cancel"];
                const counts = await Promise.all(
                    states.map(s => countData(getTables().purchaseOrders, [[getField('purchaseOrders', 'status'), "=", s]]))
                );

                const chartData = states.map((s, i) => ({
                    name: PO_STATE_LABELS[s] || s,
                    siparis_sayisi: counts[i]
                })).filter(d => d.siparis_sayisi > 0);

                const total = counts.reduce((a, b) => a + b, 0);

                return {
                    content:
                        `## 📊 Satın Alma Sipariş Durum Dağılımı\n\n` +
                        `Toplam **${total}** sipariş:\n\n` +
                        chartData.map(d =>
                            `- **${d.name}**: ${d.siparis_sayisi} sipariş (%${total ? ((d.siparis_sayisi / total) * 100).toFixed(1) : 0})`
                        ).join('\n'),
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            case "top_purchases": {
                const data = await searchData(
                    getTables().purchaseOrders, [[getField('purchaseOrders', 'status'), "=", "purchase"]], getPOFields(), 10, `${getField('purchaseOrders', 'totalAmount')} DESC`
                );
                if (!data?.length) {
                    return { content: "Onaylı satın alma siparişi bulunamadı.", data: null, ui_component: null };
                }

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    siparis: getValue(r, 'purchaseOrders', 'name'),
                    tedarikci: getValue(r, 'purchaseOrders', 'vendor'),
                    tutar: getNumericValue(r, 'purchaseOrders', 'totalAmount').toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    tarih: getValue(r, 'purchaseOrders', 'date')
                }));

                return {
                    content:
                        `## 🏆 En Yüksek Tutarlı Satın Almalar (Top 10)\n\n` +
                        `En büyük alım: **${getValue(data[0], 'purchaseOrders', 'name')}** — ` +
                        `**${getNumericValue(data[0], 'purchaseOrders', 'totalAmount').toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            // --- WRITE OPERATIONS (Onay sistemi ile) ---
            case "create_purchase": {
                if (!writeEnabled) {
                    return {
                        content: "**Yazma izni kapalı.** Satın alma siparişi oluşturmak için Ayarlar panelinden **Yazma İşlevi** seçeneğini aktif edin.",
                        data: null,
                        ui_component: null
                    };
                }

                const poData = await extractWriteData(userQuery, `Kullanıcının mesajından satın alma siparişi bilgilerini çıkar. JSON formatında döndür.
Alanlar: partner_name (tedarikçi adı, zorunlu).
Sadece JSON döndür, başka bir şey yazma.
Örnek: {"partner_name": "ABC Tedarik Ltd"}
Eğer tedarikçi adı bulunamadıysa {"partner_name": null} döndür.`);

                if (!poData || !poData.partner_name) {
                    return {
                        content: "Satın alma siparişi için tedarikçi adı gerekli.\n\n**Örnek:**\n- \"ABC Tedarik için yeni satın alma oluştur\"\n- \"XYZ Ltd adına satın alma ekle\"",
                        data: null,
                        ui_component: null
                    };
                }

                return buildWriteConfirmationResponse('create_purchase', 'purchasing', poData);
            }

            case "update_purchase": {
                if (!writeEnabled) {
                    return {
                        content: "**Yazma izni kapalı.** Satın alma siparişi güncellemek için Ayarlar panelinden **Yazma İşlevi** seçeneğini aktif edin.",
                        data: null,
                        ui_component: null
                    };
                }

                const updateData = await extractWriteData(userQuery, `Kullanıcının mesajından satın alma siparişi güncelleme bilgilerini çıkar. JSON formatında döndür.
Alanlar: po_name (güncellenecek siparişin numarası, zorunlu), partner_name (yeni tedarikçi adı).
Sadece değişecek alanları ekle. Değişmeyen alanları ekleme.
Sadece JSON döndür, başka bir şey yazma.
Örnek: {"po_name": "P00001", "partner_name": "ABC Tedarik Ltd"}
Eğer sipariş numarası bulunamadıysa {"po_name": null} döndür.`);
                if (!updateData || !updateData.po_name) {
                    return {
                        content: "Satın alma siparişi güncellemek için sipariş numarası gerekli.\n\n**Örnek:**\n- \"P00001 siparişinin tedarikçisini ABC Ltd olarak güncelle\"",
                        data: null,
                        ui_component: null
                    };
                }

                return buildWriteConfirmationResponse('update_purchase', 'purchasing', updateData);
            }

            default:
                return executePurchasingAction("po_list", userQuery);
        }

    } catch (error: any) {
        console.error("Purchasing Action Error:", error);
        if (error.message?.includes("ECONNREFUSED")) {
            return { content: getConnectionErrorMessage(), data: null, ui_component: null };
        }
        return { content: "Satın alma verisi işlenirken hata oluştu: " + error.message, data: null, ui_component: null };
    }
}
