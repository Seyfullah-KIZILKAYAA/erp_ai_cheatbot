/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * INVENTORY AGENT
 * Specialized in stock levels, products, warehouses, and supply status.
 * Connects to Odoo ERP via XML-RPC for real-time data.
 *
 * Intent-based architecture:
 * - product_list: Ürün listesi
 * - product_summary: Ürün/stok özeti (toplam ürün, kritik stok, ortalama stok vb.)
 * - critical_stock: Kritik seviyedeki ürünler (qty_available < 10)
 * - stock_search: Ürün arama (ilike)
 * - stock_movement: Stok hareketleri (stock.move)
 * - stock_value: Stok değeri analizi (toplam stok * fiyat)
 * - stock_chart: Stok durumu bar chart
 */

import { searchReadOdoo, countOdoo, createOdoo } from "@/lib/odooClient";
import { withRetry, withTimeout } from "@/lib/utils/errorHandling";
import { extractWriteData } from "@/lib/utils/writeHelper";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type InventoryIntent =
    | "product_list"
    | "product_summary"
    | "critical_stock"
    | "stock_search"
    | "stock_movement"
    | "stock_value"
    | "stock_chart"
    | "create_product";

const PRODUCT_FIELDS = ["id", "name", "qty_available", "list_price", "default_code"];
const QUANT_FIELDS = ["id", "product_id", "location_id", "quantity", "reserved_quantity"];
const MOVE_FIELDS = ["id", "product_id", "date", "quantity", "state", "location_id", "location_dest_id"];

const MOVE_STATE_LABELS: Record<string, string> = {
    draft: "Taslak",
    waiting: "Bekliyor",
    confirmed: "Onaylandı",
    partially_available: "Kısmen Hazır",
    assigned: "Hazır",
    done: "Tamamlandı",
    cancel: "İptal"
};

const CRITICAL_THRESHOLD = 10;

export async function processInventoryQuery(userQuery: string, history: any[], writeEnabled: boolean = false) {
    const lower = userQuery.toLowerCase();

    // --- Hard-coded intents for WRITE operations ---
    if (lower.includes("ürün oluştur") || lower.includes("ürün ekle") || lower.includes("yeni ürün")) {
        return executeInventoryAction("create_product", userQuery, undefined, writeEnabled);
    }

    // --- Hard-coded intents for common queries ---
    if (lower.includes("tüm ürünleri listele") || lower.includes("ürün listesi")) {
        return executeInventoryAction("product_list", userQuery);
    }
    if (lower.includes("kritik stok") || lower.includes("düşük stok") || lower.includes("stok uyarı") || lower.includes("stok alarm")) {
        return executeInventoryAction("critical_stock", userQuery);
    }
    if (lower.includes("stok özet") || lower.includes("envanter özet") || lower.includes("stok rapor") || lower.includes("ürün özet")) {
        return executeInventoryAction("product_summary", userQuery);
    }
    if (lower.includes("stok hareket") || lower.includes("giriş çıkış") || lower.includes("stok transfer")) {
        return executeInventoryAction("stock_movement", userQuery);
    }
    if (lower.includes("stok değer") || lower.includes("envanter değer") || lower.includes("stok maliyet")) {
        return executeInventoryAction("stock_value", userQuery);
    }
    if (lower.includes("stok grafik") || lower.includes("stok chart") || lower.includes("stok dağılım")) {
        return executeInventoryAction("stock_chart", userQuery);
    }
    if (lower.includes("ürün ara") || lower.includes("ürün bul") || lower.includes("stok ara")) {
        return executeInventoryAction("stock_search", userQuery);
    }

    // --- LLM-based intent detection for ambiguous queries ---
    const systemPrompt = `
    Sen bir **Stok ve Depo Yönetimi AI Uzmanısın**. Odoo ERP sisteminde ürün stok seviyeleri, depo hareketleri ve envanter analizi yapıyorsun.

    MEVCUT ANALİZ TÜRLERİ:
    1. "product_list" → Tüm ürünleri listele
    2. "product_summary" → Stok/ürün özeti ve istatistikleri (toplam ürün, kritik stok sayısı, ortalama stok vb.)
    3. "critical_stock" → Kritik seviyedeki ürünler (qty_available < ${CRITICAL_THRESHOLD})
    4. "stock_search" → Belirli bir ürünü ara (search_term kullan)
    5. "stock_movement" → Stok hareketleri (giriş/çıkış/transfer)
    6. "stock_value" → Stok değeri analizi (stok miktarı * birim fiyat)
    7. "stock_chart" → Stok durumu grafiği

    KURALLAR:
    - SADECE GEÇERLİ JSON formatında yanıt ver.
    - Eğer ürün aranıyorsa, "search_term" alanına arama terimini ekle.
    - Bugün: ${new Date().toISOString().split('T')[0]}

    ÇIKTI FORMATI:
    {
        "intent": "product_list",
        "search_term": null,
        "reasoning": "Kullanıcı ürün listesini görmek istiyor."
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
                'Inventory Agent LLM request timed out'
            ),
            { maxRetries: 2, baseDelay: 1000 }
        );

        if (!response.ok) {
            return { content: "Stok AI servisinden yanıt alınamadı.", data: null, ui_component: null };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        let parsed: any;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
            else parsed = { intent: "product_list" };
        }

        return executeInventoryAction(parsed.intent || "product_list", userQuery, parsed.search_term, writeEnabled);

    } catch (error: any) {
        console.error("Inventory Agent Error:", error);
        return executeInventoryAction("product_summary", userQuery);
    }
}

async function executeInventoryAction(intent: InventoryIntent, userQuery: string, searchTerm?: string, writeEnabled: boolean = false) {
    try {
        switch (intent) {
            // ─── Product List ───────────────────────────────────────────
            case "product_list": {
                const data = await searchReadOdoo(
                    "product.product", [], PRODUCT_FIELDS, 100, "name ASC"
                );
                if (!data?.length) {
                    return { content: "Sistemde ürün kaydı bulunamadı.", data: null, ui_component: null };
                }

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    kod: r.default_code || '-',
                    urun: r.name,
                    stok: Number(r.qty_available ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    fiyat: Number(r.list_price ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺'
                }));

                const totalQty = data.reduce((s: number, r: any) => s + Number(r.qty_available ?? 0), 0);
                const criticalCount = data.filter((r: any) => Number(r.qty_available ?? 0) < CRITICAL_THRESHOLD).length;

                return {
                    content:
                        `## 📦 Ürün Listesi\n\n` +
                        `Toplam **${data.length}** ürün listelendi.\n` +
                        `Toplam stok miktarı: **${totalQty.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}** adet\n` +
                        `Kritik stok seviyesinde (< ${CRITICAL_THRESHOLD}): **${criticalCount}** ürün`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            // ─── Product / Stock Summary ────────────────────────────────
            case "product_summary": {
                const allProducts = await searchReadOdoo(
                    "product.product", [], ["id", "qty_available", "list_price"], 500, ""
                );

                const totalProducts = allProducts?.length || 0;
                if (!totalProducts) {
                    return { content: "Sistemde ürün kaydı bulunamadı.", data: null, ui_component: null };
                }

                const quantities = allProducts.map((r: any) => Number(r.qty_available ?? 0));
                const totalQty = quantities.reduce((a: number, b: number) => a + b, 0);
                const avgQty = totalQty / totalProducts;
                const maxQty = Math.max(...quantities);
                const minQty = Math.min(...quantities);
                const criticalCount = quantities.filter((q: number) => q < CRITICAL_THRESHOLD).length;
                const zeroStockCount = quantities.filter((q: number) => q <= 0).length;

                const totalValue = allProducts.reduce((s: number, r: any) => {
                    return s + (Number(r.qty_available ?? 0) * Number(r.list_price ?? 0));
                }, 0);

                const [totalMoves, doneMoves] = await Promise.all([
                    countOdoo("stock.move", []),
                    countOdoo("stock.move", [["state", "=", "done"]])
                ]);

                return {
                    content:
                        `## 📊 Stok & Envanter Özeti\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Ürün | **${totalProducts}** |\n` +
                        `| Toplam Stok Miktarı | **${totalQty.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}** adet |\n` +
                        `| Ortalama Stok / Ürün | **${avgQty.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}** adet |\n` +
                        `| En Yüksek Stok | **${maxQty.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}** adet |\n` +
                        `| En Düşük Stok | **${minQty.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}** adet |\n` +
                        `| Kritik Stok (< ${CRITICAL_THRESHOLD}) | **${criticalCount}** ürün |\n` +
                        `| Stokta Olmayan (≤ 0) | **${zeroStockCount}** ürün |\n` +
                        `| Tahmini Stok Değeri | **${totalValue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Toplam Stok Hareketi | **${totalMoves}** |\n` +
                        `| Tamamlanan Hareket | **${doneMoves}** |\n\n` +
                        `Sağlık oranı: **%${totalProducts ? (((totalProducts - criticalCount) / totalProducts) * 100).toFixed(1) : 0}** ürün yeterli stokta`,
                    data: { totalProducts, totalQty, avgQty, criticalCount, zeroStockCount, totalValue, totalMoves, doneMoves },
                    ui_component: 'stat'
                };
            }

            // ─── Critical Stock ─────────────────────────────────────────
            case "critical_stock": {
                const data = await searchReadOdoo(
                    "product.product",
                    [["qty_available", "<", CRITICAL_THRESHOLD]],
                    PRODUCT_FIELDS, 100, "qty_available ASC"
                );
                if (!data?.length) {
                    return {
                        content:
                            `## ✅ Kritik Stok Durumu\n\n` +
                            `Tebrikler! Stok seviyesi **${CRITICAL_THRESHOLD}** adetten düşük ürün bulunmuyor.`,
                        data: null,
                        ui_component: null
                    };
                }

                const zeroStock = data.filter((r: any) => Number(r.qty_available ?? 0) <= 0);
                const lowStock = data.filter((r: any) => {
                    const qty = Number(r.qty_available ?? 0);
                    return qty > 0 && qty < CRITICAL_THRESHOLD;
                });

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    kod: r.default_code || '-',
                    urun: r.name,
                    stok: Number(r.qty_available ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    fiyat: Number(r.list_price ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺',
                    durum: Number(r.qty_available ?? 0) <= 0 ? '🔴 Tükendi' : '🟡 Düşük'
                }));

                return {
                    content:
                        `## ⚠️ Kritik Stok Uyarısı\n\n` +
                        `Stok seviyesi **${CRITICAL_THRESHOLD}** adetten düşük **${data.length}** ürün tespit edildi.\n\n` +
                        `| Durum | Adet |\n|-------|------|\n` +
                        `| 🔴 Stokta Yok (≤ 0) | **${zeroStock.length}** |\n` +
                        `| 🟡 Düşük Stok (1-${CRITICAL_THRESHOLD - 1}) | **${lowStock.length}** |\n\n` +
                        `Bu ürünler için acil tedarik planlaması önerilir.`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            // ─── Stock Search ───────────────────────────────────────────
            case "stock_search": {
                const term = searchTerm || userQuery.replace(/ürün ara|ürün bul|stok ara/gi, '').trim();
                if (!term) {
                    return { content: "Lütfen aramak istediğiniz ürün adını belirtin.", data: null, ui_component: null };
                }

                const data = await searchReadOdoo(
                    "product.product",
                    [["name", "ilike", term]],
                    PRODUCT_FIELDS, 50, "name ASC"
                );
                if (!data?.length) {
                    return {
                        content: `## 🔍 Ürün Arama: "${term}"\n\nBu arama ile eşleşen ürün bulunamadı.`,
                        data: null,
                        ui_component: null
                    };
                }

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    kod: r.default_code || '-',
                    urun: r.name,
                    stok: Number(r.qty_available ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    fiyat: Number(r.list_price ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺'
                }));

                return {
                    content: `## 🔍 Ürün Arama: "${term}"\n\n**${data.length}** sonuç bulundu.`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            // ─── Stock Movement ─────────────────────────────────────────
            case "stock_movement": {
                const data = await searchReadOdoo(
                    "stock.move", [], MOVE_FIELDS, 50, "date DESC"
                );
                if (!data?.length) {
                    return { content: "Sistemde stok hareketi bulunamadı.", data: null, ui_component: null };
                }

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    urun: Array.isArray(r.product_id) ? r.product_id[1] : r.product_id,
                    miktar: Number(r.quantity ?? 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    kaynak: Array.isArray(r.location_id) ? r.location_id[1] : r.location_id,
                    hedef: Array.isArray(r.location_dest_id) ? r.location_dest_id[1] : r.location_dest_id,
                    durum: MOVE_STATE_LABELS[r.state] || r.state,
                    tarih: r.date
                }));

                // State distribution
                const stateCounts: Record<string, number> = {};
                data.forEach((r: any) => {
                    const label = MOVE_STATE_LABELS[r.state] || r.state;
                    stateCounts[label] = (stateCounts[label] || 0) + 1;
                });

                const statusLines = Object.entries(stateCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, count]) => `- **${label}**: ${count} hareket`)
                    .join('\n');

                return {
                    content:
                        `## 🔄 Stok Hareketleri\n\n` +
                        `Son **${data.length}** stok hareketi listelendi.\n\n` +
                        `**Durum Dağılımı:**\n${statusLines}`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            // ─── Stock Value Analysis ───────────────────────────────────
            case "stock_value": {
                const data = await searchReadOdoo(
                    "product.product", [], PRODUCT_FIELDS, 500, "qty_available DESC"
                );
                if (!data?.length) {
                    return { content: "Stok değeri hesaplanamadı: ürün bulunamadı.", data: null, ui_component: null };
                }

                const enriched = data
                    .map((r: any) => {
                        const qty = Number(r.qty_available ?? 0);
                        const price = Number(r.list_price ?? 0);
                        return {
                            name: r.name,
                            default_code: r.default_code || '-',
                            qty_available: qty,
                            list_price: price,
                            value: qty * price
                        };
                    })
                    .filter((r: any) => r.value > 0)
                    .sort((a: any, b: any) => b.value - a.value);

                if (!enriched.length) {
                    return {
                        content: "Stok değeri sıfırdan büyük ürün bulunamadı.",
                        data: null,
                        ui_component: null
                    };
                }

                const totalValue = enriched.reduce((s: number, r: any) => s + r.value, 0);
                const top10 = enriched.slice(0, 10);

                const tableData = enriched.slice(0, 50).map((r: any, i: number) => ({
                    sira: i + 1,
                    kod: r.default_code,
                    urun: r.name,
                    stok: r.qty_available.toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    birim_fiyat: r.list_price.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺',
                    toplam_deger: r.value.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺'
                }));

                const top3Lines = top10.slice(0, 3).map((r: any, i: number) =>
                    `${i + 1}. **${r.name}** — ${r.value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`
                ).join('\n');

                return {
                    content:
                        `## 💰 Stok Değeri Analizi\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Değeri > 0 Olan Ürün | **${enriched.length}** |\n` +
                        `| Toplam Stok Değeri | **${totalValue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Ort. Ürün Değeri | **${(totalValue / enriched.length).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n\n` +
                        `**En Değerli 3 Ürün:**\n${top3Lines}`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            // ─── Stock Chart ────────────────────────────────────────────
            case "stock_chart": {
                const data = await searchReadOdoo(
                    "product.product", [], PRODUCT_FIELDS, 500, "qty_available DESC"
                );
                if (!data?.length) {
                    return { content: "Stok grafiği için yeterli veri bulunamadı.", data: null, ui_component: null };
                }

                // Top 15 products by stock quantity for the chart
                const chartData = data
                    .slice(0, 15)
                    .map((r: any) => ({
                        name: r.name.length > 25 ? r.name.substring(0, 25) + '...' : r.name,
                        stok_miktari: Number(r.qty_available ?? 0)
                    }))
                    .filter((r: any) => r.stok_miktari > 0);

                if (!chartData.length) {
                    return { content: "Stokta bulunan ürün yok, grafik oluşturulamadı.", data: null, ui_component: null };
                }

                // Stock distribution buckets
                const quantities = data.map((r: any) => Number(r.qty_available ?? 0));
                const totalProducts = quantities.length;
                const zeroStock = quantities.filter((q: number) => q <= 0).length;
                const lowStock = quantities.filter((q: number) => q > 0 && q < CRITICAL_THRESHOLD).length;
                const normalStock = quantities.filter((q: number) => q >= CRITICAL_THRESHOLD && q < 100).length;
                const highStock = quantities.filter((q: number) => q >= 100).length;

                return {
                    content:
                        `## 📈 Stok Durumu Grafiği\n\n` +
                        `En yüksek stoklu **${chartData.length}** ürün grafikte gösterilmektedir.\n\n` +
                        `**Stok Dağılım Özeti** (${totalProducts} ürün):\n` +
                        `- 🔴 Stokta yok (≤ 0): **${zeroStock}** ürün\n` +
                        `- 🟡 Düşük stok (1-${CRITICAL_THRESHOLD - 1}): **${lowStock}** ürün\n` +
                        `- 🟢 Normal stok (${CRITICAL_THRESHOLD}-99): **${normalStock}** ürün\n` +
                        `- 🔵 Yüksek stok (100+): **${highStock}** ürün`,
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            // --- WRITE OPERATIONS ---
            case "create_product": {
                if (!writeEnabled) {
                    return {
                        content: "**Yazma izni kapalı.** Ürün oluşturmak için Ayarlar panelinden **Yazma İşlevi** seçeneğini aktif edin.",
                        data: null,
                        ui_component: null
                    };
                }

                const prodData = await extractWriteData(userQuery, `Kullanıcının mesajından ürün bilgilerini çıkar. JSON formatında döndür.
Alanlar: name (ürün adı, zorunlu), list_price (satış fiyatı, opsiyonel), default_code (ürün kodu, opsiyonel), type (ürün tipi: "consu" tüketim malı, "product" stoklanan ürün - varsayılan "consu").
Sadece JSON döndür, başka bir şey yazma.
Örnek: {"name": "Laptop HP ProBook", "list_price": 25000, "default_code": "LP-001", "type": "product"}
Eğer yeterli bilgi yoksa {"name": null} döndür.`);

                if (!prodData || !prodData.name) {
                    return {
                        content: "Ürün oluşturmak için en azından ürün adı gerekli.\n\n**Örnek:**\n- \"Yeni ürün ekle: Laptop HP ProBook, 25000 TL, kod: LP-001\"\n- \"Ürün oluştur: Masa Lambası, fiyat 450 TL\"",
                        data: null,
                        ui_component: null
                    };
                }

                const values: Record<string, any> = { name: prodData.name };
                if (prodData.list_price) values.list_price = prodData.list_price;
                if (prodData.default_code) values.default_code = prodData.default_code;
                if (prodData.type) values.type = prodData.type;

                const newProdId = await createOdoo("product.product", values);
                const created = await searchReadOdoo("product.product", [["id", "=", newProdId]], PRODUCT_FIELDS, 1);

                return {
                    content:
                        `## Ürün Başarıyla Oluşturuldu!\n\n` +
                        `| Alan | Değer |\n|------|-------|\n` +
                        `| ID | **${newProdId}** |\n` +
                        `| Ad | **${prodData.name}** |\n` +
                        (prodData.default_code ? `| Kod | **${prodData.default_code}** |\n` : '') +
                        (prodData.list_price ? `| Fiyat | **${Number(prodData.list_price).toLocaleString('tr-TR')} ₺** |\n` : '') +
                        `\nKayıt Odoo'da başarıyla oluşturuldu.`,
                    data: created,
                    ui_component: 'table'
                };
            }

            default:
                return executeInventoryAction("product_list", userQuery);
        }

    } catch (error: any) {
        console.error("Inventory Action Error:", error);

        if (error.message?.includes("ECONNREFUSED")) {
            return {
                content: "⚠️ Odoo ERP sistemine bağlanılamıyor. Lütfen Odoo servisinin (localhost:8069) çalıştığından emin olun.",
                data: null,
                ui_component: null
            };
        }

        return {
            content: "Stok verisi işlenirken hata oluştu: " + error.message,
            data: null,
            ui_component: null
        };
    }
}
