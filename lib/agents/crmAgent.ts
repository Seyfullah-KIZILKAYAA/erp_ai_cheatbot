/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * CRM AGENT
 * Specialized in leads, opportunities, sales pipeline and CRM KPIs.
 *
 * Intent-based architecture:
 * - opportunity_list: Fırsat listesi
 * - opportunity_summary: CRM özeti / istatistikleri
 * - open_opportunities: Açık fırsatlar (probability > 0)
 * - won_opportunities: Kazanılan fırsatlar (probability >= 100)
 * - pipeline_chart: Satış hunisi dağılımı (chart)
 * - revenue_forecast: Beklenen gelir analizi
 * - stage_analysis: Aşama bazlı analiz (chart)
 */

import { searchData, countData, getTables, getFields, getValue, getNumericValue, getField, getConnectionLabel, getConnectionErrorMessage, getRawValue } from "@/lib/dataAccess";
import { buildWriteConfirmationResponse } from "@/lib/utils/writeConfirmationHelper";
import { withRetry, withTimeout } from "@/lib/utils/errorHandling";
import { extractWriteData } from "@/lib/utils/writeHelper";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type CrmIntent =
    | "opportunity_list"
    | "opportunity_summary"
    | "open_opportunities"
    | "won_opportunities"
    | "pipeline_chart"
    | "revenue_forecast"
    | "stage_analysis"
    | "create_lead"
    | "update_lead";

// Dynamic field resolution
const getLeadFields = () => getFields('crmLeads', ['id', 'name', 'customer', 'stage', 'probability', 'expectedRevenue']);

export async function processCrmQuery(userQuery: string, history: any[], writeEnabled: boolean = false) {
    const lower = userQuery.toLowerCase();

    // --- Hard-coded intents for WRITE operations ---
    if (lower.includes("fırsat oluştur") || lower.includes("fırsat ekle") || lower.includes("yeni fırsat") || lower.includes("lead oluştur") || lower.includes("lead ekle")) {
        return executeCrmAction("create_lead", userQuery, writeEnabled);
    }

    if (lower.includes("fırsat güncelle") || lower.includes("fırsatı güncelle") || lower.includes("lead güncelle") || lower.includes("fırsatı düzenle") || lower.includes("fırsat bilgilerini değiştir")) {
        return executeCrmAction("update_lead", userQuery, writeEnabled);
    }

    // --- Hard-coded intents ---
    if (lower.includes("açık crm fırsatlarını") || lower.includes("açık fırsatları") || lower.includes("aktif fırsatlar")) {
        return executeCrmAction("open_opportunities", userQuery);
    }
    if (lower.includes("kazanılan fırsat") || lower.includes("kazanılmış") || lower.includes("won")) {
        return executeCrmAction("won_opportunities", userQuery);
    }
    if (lower.includes("fırsat listesi") || lower.includes("tüm fırsatları") || lower.includes("crm listesi")) {
        return executeCrmAction("opportunity_list", userQuery);
    }
    if (lower.includes("crm özet") || lower.includes("crm rapor") || lower.includes("fırsat özet") || lower.includes("pipeline özet")) {
        return executeCrmAction("opportunity_summary", userQuery);
    }
    if (lower.includes("satış hunisi") || lower.includes("pipeline grafik") || lower.includes("huni dağılım")) {
        return executeCrmAction("pipeline_chart", userQuery);
    }
    if (lower.includes("beklenen gelir") || lower.includes("revenue forecast") || lower.includes("tahmini gelir")) {
        return executeCrmAction("revenue_forecast", userQuery);
    }
    if (lower.includes("aşama analiz") || lower.includes("stage analiz") || lower.includes("aşama dağılım")) {
        return executeCrmAction("stage_analysis", userQuery);
    }

    // --- LLM-based intent detection ---
    const connLabel = getConnectionLabel();
    const systemPrompt = `
    Sen bir **Müşteri İlişkileri (CRM) AI Uzmanısın**. ${connLabel}'de adaylar, fırsatlar ve satış hunisini analiz ediyorsun.

    MEVCUT ANALİZ TÜRLERİ:
    1. "opportunity_list" → Fırsat listesi
    2. "opportunity_summary" → CRM özeti ve istatistikleri
    3. "open_opportunities" → Açık fırsatlar
    4. "won_opportunities" → Kazanılan fırsatlar
    5. "pipeline_chart" → Satış hunisi dağılımı (grafik)
    6. "revenue_forecast" → Beklenen gelir analizi
    7. "stage_analysis" → Aşama bazlı fırsat analizi (grafik)
    8. "create_lead" → Yeni CRM fırsatı oluşturma
    9. "update_lead" → CRM fırsatı güncelleme (aşama, gelir vb.)

    ÇIKTI FORMATI:
    { "intent": "opportunity_list", "reasoning": "Açıklama" }
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
                'CRM Agent LLM request timed out'
            ),
            { maxRetries: 2, baseDelay: 1000 }
        );

        if (!response.ok) {
            return { content: "CRM AI yanıt vermedi.", data: null, ui_component: null };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        let parsed: any;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
            else parsed = { intent: "opportunity_summary" };
        }

        return executeCrmAction(parsed.intent || "opportunity_summary", userQuery, writeEnabled);

    } catch (error: any) {
        console.error("CRM Agent Error:", error);
        return executeCrmAction("opportunity_summary", userQuery);
    }
}

async function executeCrmAction(intent: CrmIntent, userQuery: string, writeEnabled: boolean = false) {
    try {
        switch (intent) {
            case "opportunity_list": {
                const data = await searchData(getTables().crmLeads, [], getLeadFields(), 50, `${getField('crmLeads', 'probability')} DESC`);
                if (!data?.length) {
                    return { content: "Sistemde CRM fırsatı bulunamadı.", data: null, ui_component: null };
                }

                const totalRevenue = data.reduce((s: number, r: any) => s + getNumericValue(r, 'crmLeads', 'expectedRevenue'), 0);

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    firsat: getValue(r, 'crmLeads', 'name'),
                    musteri: getValue(r, 'crmLeads', 'customer'),
                    asama: getValue(r, 'crmLeads', 'stage'),
                    olasilik: `%${getNumericValue(r, 'crmLeads', 'probability')}`,
                    beklenen_gelir: getNumericValue(r, 'crmLeads', 'expectedRevenue').toLocaleString('tr-TR', { maximumFractionDigits: 2 })
                }));

                return {
                    content:
                        `## 📈 CRM Fırsat Listesi\n\n` +
                        `Toplam **${data.length}** fırsat listelendi.\n` +
                        `Toplam beklenen gelir: **${totalRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "opportunity_summary": {
                const totalLeads = await countData(getTables().crmLeads, []);

                const leads = await searchData(
                    getTables().crmLeads, [], [getField('crmLeads', 'probability'), getField('crmLeads', 'expectedRevenue'), getField('crmLeads', 'stage')], 500, ""
                );

                const open = (leads || []).filter((l: any) => getNumericValue(l, 'crmLeads', 'probability') > 0 && getNumericValue(l, 'crmLeads', 'probability') < 100);
                const won = (leads || []).filter((l: any) => getNumericValue(l, 'crmLeads', 'probability') >= 100);
                const lost = (leads || []).filter((l: any) => getNumericValue(l, 'crmLeads', 'probability') === 0);

                const totalExpectedRevenue = open.reduce((s: number, l: any) => s + getNumericValue(l, 'crmLeads', 'expectedRevenue'), 0);
                const wonRevenue = won.reduce((s: number, l: any) => s + getNumericValue(l, 'crmLeads', 'expectedRevenue'), 0);
                const avgProbability = open.length
                    ? (open.reduce((s: number, l: any) => s + getNumericValue(l, 'crmLeads', 'probability'), 0) / open.length)
                    : 0;

                const winRate = totalLeads ? ((won.length / totalLeads) * 100).toFixed(1) : '0';

                // Stage distribution
                const stageCounts: Record<string, number> = {};
                (leads || []).forEach((l: any) => {
                    const stage = getValue(l, 'crmLeads', 'stage', 'Belirtilmemiş');
                    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
                });

                const stageLines = Object.entries(stageCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([stage, count]) => `- **${stage}**: ${count} fırsat`)
                    .join('\n');

                return {
                    content:
                        `## 📈 CRM Departmanı Özeti\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Fırsat | **${totalLeads}** |\n` +
                        `| Açık Fırsat | **${open.length}** |\n` +
                        `| Kazanılan | **${won.length}** |\n` +
                        `| Kaybedilen / Soğuk | **${lost.length}** |\n` +
                        `| Kazanma Oranı | **%${winRate}** |\n` +
                        `| Ort. Olasılık (Açık) | **%${avgProbability.toFixed(1)}** |\n` +
                        `| Beklenen Gelir (Açık) | **${totalExpectedRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Kazanılan Gelir | **${wonRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n\n` +
                        `**Aşama Dağılımı (Top 5):**\n${stageLines}`,
                    data: { totalLeads, openCount: open.length, wonCount: won.length, lostCount: lost.length, totalExpectedRevenue, wonRevenue },
                    ui_component: null
                };
            }

            case "open_opportunities": {
                const data = await searchData(
                    getTables().crmLeads, [[getField('crmLeads', 'probability'), ">", 0], [getField('crmLeads', 'probability'), "<", 100]], getLeadFields(), 50, `${getField('crmLeads', 'probability')} DESC`
                );
                if (!data?.length) {
                    return { content: "Açık CRM fırsatı bulunmuyor.", data: null, ui_component: null };
                }

                const totalRevenue = data.reduce((s: number, r: any) => s + getNumericValue(r, 'crmLeads', 'expectedRevenue'), 0);

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    firsat: getValue(r, 'crmLeads', 'name'),
                    musteri: getValue(r, 'crmLeads', 'customer'),
                    asama: getValue(r, 'crmLeads', 'stage'),
                    olasilik: `%${getNumericValue(r, 'crmLeads', 'probability')}`,
                    beklenen_gelir: getNumericValue(r, 'crmLeads', 'expectedRevenue').toLocaleString('tr-TR', { maximumFractionDigits: 2 })
                }));

                return {
                    content:
                        `## 🟢 Açık CRM Fırsatları\n\n` +
                        `**${data.length}** açık fırsat mevcut.\n` +
                        `Toplam beklenen gelir: **${totalRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "won_opportunities": {
                const data = await searchData(
                    getTables().crmLeads, [[getField('crmLeads', 'probability'), ">=", 100]], getLeadFields(), 50, `${getField('crmLeads', 'expectedRevenue')} DESC`
                );
                if (!data?.length) {
                    return { content: "Henüz kazanılmış fırsat bulunmuyor.", data: null, ui_component: null };
                }

                const totalRevenue = data.reduce((s: number, r: any) => s + getNumericValue(r, 'crmLeads', 'expectedRevenue'), 0);

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    firsat: getValue(r, 'crmLeads', 'name'),
                    musteri: getValue(r, 'crmLeads', 'customer'),
                    kazanilan_gelir: getNumericValue(r, 'crmLeads', 'expectedRevenue').toLocaleString('tr-TR', { maximumFractionDigits: 2 })
                }));

                return {
                    content:
                        `## 🏆 Kazanılan Fırsatlar\n\n` +
                        `**${data.length}** fırsat başarıyla kazanıldı.\n` +
                        `Toplam kazanılan gelir: **${totalRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "pipeline_chart":
            case "stage_analysis": {
                const leads = await searchData(getTables().crmLeads, [], [getField('crmLeads', 'stage'), getField('crmLeads', 'expectedRevenue')], 500, "");
                if (!leads?.length) {
                    return { content: "Pipeline analizi için yeterli veri yok.", data: null, ui_component: null };
                }

                const stageData: Record<string, { count: number; revenue: number }> = {};
                leads.forEach((l: any) => {
                    const stage = getValue(l, 'crmLeads', 'stage', 'Belirtilmemiş');
                    if (!stageData[stage]) stageData[stage] = { count: 0, revenue: 0 };
                    stageData[stage].count++;
                    stageData[stage].revenue += getNumericValue(l, 'crmLeads', 'expectedRevenue');
                });

                const chartData = Object.entries(stageData)
                    .map(([name, data]) => ({
                        name: name.length > 18 ? name.substring(0, 18) + '...' : name,
                        firsat_sayisi: data.count,
                        beklenen_gelir: Math.round(data.revenue)
                    }));

                const totalPipeline = leads.reduce((s: number, l: any) => s + getNumericValue(l, 'crmLeads', 'expectedRevenue'), 0);

                return {
                    content:
                        `## 📊 Satış Hunisi (Pipeline) Analizi\n\n` +
                        `Toplam **${leads.length}** fırsat, **${chartData.length}** aşamaya dağılmış durumda.\n` +
                        `Pipeline toplam değeri: **${totalPipeline.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**\n\n` +
                        chartData.map(d => `- **${d.name}**: ${d.firsat_sayisi} fırsat (${d.beklenen_gelir.toLocaleString('tr-TR')} ₺)`).join('\n'),
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            case "revenue_forecast": {
                const leads = await searchData(
                    getTables().crmLeads, [[getField('crmLeads', 'probability'), ">", 0]], [getField('crmLeads', 'probability'), getField('crmLeads', 'expectedRevenue')], 500, ""
                );
                if (!leads?.length) {
                    return { content: "Gelir tahmini için yeterli açık fırsat yok.", data: null, ui_component: null };
                }

                // Weighted revenue = expected_revenue * (probability / 100)
                const weightedTotal = leads.reduce((s: number, l: any) => {
                    return s + (getNumericValue(l, 'crmLeads', 'expectedRevenue') * getNumericValue(l, 'crmLeads', 'probability') / 100);
                }, 0);

                const rawTotal = leads.reduce((s: number, l: any) => s + getNumericValue(l, 'crmLeads', 'expectedRevenue'), 0);

                // Group by probability ranges
                const ranges = [
                    { label: '%0-25 (Düşük)', min: 0, max: 25 },
                    { label: '%26-50 (Orta)', min: 26, max: 50 },
                    { label: '%51-75 (Yüksek)', min: 51, max: 75 },
                    { label: '%76-99 (Çok Yüksek)', min: 76, max: 99 },
                    { label: '%100 (Kazanılan)', min: 100, max: 100 },
                ];

                const chartData = ranges.map(range => {
                    const inRange = leads.filter((l: any) => {
                        const p = getNumericValue(l, 'crmLeads', 'probability');
                        return p >= range.min && p <= range.max;
                    });
                    return {
                        name: range.label,
                        firsat_sayisi: inRange.length,
                        beklenen_gelir: Math.round(inRange.reduce((s: number, l: any) => s + getNumericValue(l, 'crmLeads', 'expectedRevenue'), 0))
                    };
                }).filter(d => d.firsat_sayisi > 0);

                return {
                    content:
                        `## 💰 CRM Beklenen Gelir Analizi\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Beklenen Gelir | **${rawTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Ağırlıklı Gelir Tahmini | **${weightedTotal.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Açık Fırsat Sayısı | **${leads.length}** |\n\n` +
                        `Ağırlıklı gelir = beklenen gelir x olasılık oranı`,
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            // --- WRITE OPERATIONS (Onay sistemi ile) ---
            case "create_lead": {
                if (!writeEnabled) {
                    return {
                        content: "**Yazma izni kapalı.** CRM fırsatı oluşturmak için Ayarlar panelinden **Yazma İşlevi** seçeneğini aktif edin.",
                        data: null,
                        ui_component: null
                    };
                }

                const leadData = await extractWriteData(userQuery, `Kullanıcının mesajından CRM fırsat/lead bilgilerini çıkar. JSON formatında döndür.
Alanlar: name (fırsat adı, zorunlu), partner_name (müşteri adı, opsiyonel), expected_revenue (beklenen gelir, opsiyonel).
Sadece JSON döndür, başka bir şey yazma.
Örnek: {"name": "Yeni Proje Teklifi", "partner_name": "Acme Ltd", "expected_revenue": 50000}
Eğer yeterli bilgi yoksa {"name": null} döndür.`);

                if (!leadData || !leadData.name) {
                    return {
                        content: "CRM fırsatı oluşturmak için fırsat adı gerekli.\n\n**Örnek:**\n- \"Yeni fırsat oluştur: Acme Ltd Web Projesi, 50000 TL\"\n- \"Lead ekle: Yazılım Danışmanlık Teklifi\"",
                        data: null,
                        ui_component: null
                    };
                }

                return buildWriteConfirmationResponse('create_lead', 'crm', leadData);
            }

            case "update_lead": {
                if (!writeEnabled) {
                    return {
                        content: "**Yazma izni kapalı.** CRM fırsatı güncellemek için Ayarlar panelinden **Yazma İşlevi** seçeneğini aktif edin.",
                        data: null,
                        ui_component: null
                    };
                }

                const updateData = await extractWriteData(userQuery, `Kullanıcının mesajından CRM fırsat güncelleme bilgilerini çıkar. JSON formatında döndür.
Alanlar: lead_name (güncellenecek fırsatın mevcut adı, zorunlu), name (yeni fırsat adı), partner_name (yeni müşteri adı), expected_revenue (yeni beklenen gelir), stage_name (yeni aşama adı).
Sadece değişecek alanları ekle. Değişmeyen alanları ekleme.
Sadece JSON döndür, başka bir şey yazma.
Örnek: {"lead_name": "Web Projesi", "expected_revenue": 75000}
Eğer fırsat adı bulunamadıysa {"lead_name": null} döndür.`);
                if (!updateData || !updateData.lead_name) {
                    return {
                        content: "CRM fırsatı güncellemek için fırsat adı gerekli.\n\n**Örnek:**\n- \"Web Projesi fırsatının beklenen gelirini 75000 TL olarak güncelle\"\n- \"Danışmanlık Teklifi fırsatını 'Teklif' aşamasına taşı\"",
                        data: null,
                        ui_component: null
                    };
                }

                return buildWriteConfirmationResponse('update_lead', 'crm', updateData);
            }

            default:
                return executeCrmAction("opportunity_summary", userQuery);
        }

    } catch (error: any) {
        console.error("CRM Action Error:", error);
        if (error.message?.includes("ECONNREFUSED")) {
            return { content: getConnectionErrorMessage(), data: null, ui_component: null };
        }
        return { content: "CRM verisi işlenirken hata oluştu: " + error.message, data: null, ui_component: null };
    }
}
