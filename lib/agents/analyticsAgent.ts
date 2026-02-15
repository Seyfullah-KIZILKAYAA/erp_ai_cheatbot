/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ANALYTICS AGENT
 * Specialized in ML analytics via ERPO platform:
 * - Prophet sales forecasting
 * - Isolation Forest anomaly detection
 * - K-Means RFM customer segmentation
 * - KPI dashboard metrics
 * - AI-generated narrative reports (Groq)
 */

import {
    getKpiSummary,
    getRevenueTrend,
    getTopCustomers,
    getForecasts,
    getRecentAnomalies,
    getSegmentsOverview,
    getDailyReport,
    getAnomalyReport,
    getForecastReport,
} from "@/lib/erpoClient";
import { withRetry, withTimeout } from "@/lib/utils/errorHandling";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type AnalyticsIntent =
    | "kpi_summary"
    | "revenue_trend"
    | "top_customers"
    | "forecast"
    | "anomalies"
    | "segments"
    | "daily_report"
    | "anomaly_report"
    | "forecast_report";

export async function processAnalyticsQuery(userQuery: string, history: any[]) {
    const lower = userQuery.toLowerCase();

    // --- Hard-coded intents for common queries ---
    if (lower.includes("kpi") || lower.includes("genel durum") || lower.includes("özet metrik")) {
        return executeAnalyticsAction("kpi_summary", userQuery);
    }
    if (lower.includes("gelir trendi") || lower.includes("aylık gelir") || lower.includes("revenue trend")) {
        return executeAnalyticsAction("revenue_trend", userQuery);
    }
    if (lower.includes("en iyi müşteri") || lower.includes("top müşteri") || lower.includes("en çok harcayan")) {
        return executeAnalyticsAction("top_customers", userQuery);
    }
    if (lower.includes("tahmin") || lower.includes("forecast") || lower.includes("prophet") || lower.includes("satış tahmini")) {
        return executeAnalyticsAction("forecast", userQuery);
    }
    if (lower.includes("anomali") || lower.includes("anormallik") || lower.includes("sapma") || lower.includes("isolation forest")) {
        return executeAnalyticsAction("anomalies", userQuery);
    }
    if (lower.includes("segment") || lower.includes("rfm") || lower.includes("müşteri grubu") || lower.includes("k-means") || lower.includes("kümeleme")) {
        return executeAnalyticsAction("segments", userQuery);
    }
    if (lower.includes("günlük rapor") || lower.includes("daily report") || lower.includes("ai rapor")) {
        return executeAnalyticsAction("daily_report", userQuery);
    }
    if (lower.includes("anomali rapor")) {
        return executeAnalyticsAction("anomaly_report", userQuery);
    }
    if (lower.includes("tahmin rapor") || lower.includes("forecast rapor")) {
        return executeAnalyticsAction("forecast_report", userQuery);
    }

    // --- LLM-based intent detection for ambiguous queries ---
    const systemPrompt = `
    Sen bir **ML Analitik ve Yapay Zeka Rapor Uzmanısın**. ERPO platformu üzerinden gelişmiş analizler sunuyorsun.
    Görsel mimarideki **Analytics Agent** rolündesin.

    SORUMLULUKLARIN:
    - Satış tahminleri (Prophet ML modeli) sunmak.
    - Anomali tespiti (Isolation Forest) sonuçlarını raporlamak.
    - Müşteri segmentasyonu (K-Means RFM analizi) yapmak.
    - KPI özeti ve gelir trendi sunmak.
    - AI destekli doğal dil raporları üretmek.

    MEVCUT ANALİZ TÜRLERİ:
    1. "kpi_summary" → Genel KPI özeti (toplam gelir, sipariş sayısı, aktif müşteri, anomali sayısı)
    2. "revenue_trend" → Aylık gelir trendi grafiği
    3. "top_customers" → En çok harcayan müşteriler listesi
    4. "forecast" → Prophet ML satış tahmini (güven bandlı)
    5. "anomalies" → Isolation Forest anomali tespiti sonuçları
    6. "segments" → K-Means RFM müşteri segmentasyonu
    7. "daily_report" → AI günlük rapor (Groq ile üretilen)
    8. "anomaly_report" → AI anomali analiz raporu
    9. "forecast_report" → AI tahmin analiz raporu

    KURALLAR:
    - SADECE GEÇERLİ JSON formatında yanıt ver. Hiçbir ek metin ekleme.
    - Kullanıcının sorusuna en uygun analiz türünü seç.
    - Eğer birden fazla analiz gerekiyorsa, en öncelikli olanı seç.

    ÇIKTI FORMATI (ZORUNLU):
    {
        "intent": "forecast",
        "reasoning": "Kullanıcı satış tahmini istediği için Prophet modeli sonuçları sunulacak."
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
                'Analytics Agent LLM request timed out'
            ),
            { maxRetries: 2, baseDelay: 1000 }
        );

        if (!response.ok) {
            return { content: "Analitik AI yanıt vermedi.", data: null, ui_component: null };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        let parsed: any;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
            else parsed = { intent: "kpi_summary" };
        }

        const intent = parsed.intent as AnalyticsIntent || "kpi_summary";
        return executeAnalyticsAction(intent, userQuery);

    } catch (error: any) {
        console.error("Analytics Agent LLM Error:", error);
        // Fallback: try KPI summary
        return executeAnalyticsAction("kpi_summary", userQuery);
    }
}

async function executeAnalyticsAction(intent: AnalyticsIntent, userQuery: string) {
    try {
        switch (intent) {
            case "kpi_summary": {
                const kpi = await getKpiSummary();
                const growthText = kpi.mom_growth_pct !== null
                    ? `Aylık büyüme oranı **%${kpi.mom_growth_pct.toFixed(1)}** seviyesinde.`
                    : "Aylık büyüme verisi henüz mevcut değil.";

                return {
                    content:
                        `## 📊 ERPO KPI Özeti\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Gelir | **${Number(kpi.total_revenue).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Toplam Sipariş | **${kpi.total_orders.toLocaleString('tr-TR')}** |\n` +
                        `| Aktif Müşteri | **${kpi.active_customers.toLocaleString('tr-TR')}** |\n` +
                        `| Ort. Sipariş Tutarı | **${Number(kpi.avg_order_value).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺** |\n` +
                        `| Tespit Edilen Anomali | **${kpi.anomaly_count}** |\n\n` +
                        growthText,
                    data: kpi,
                    ui_component: null
                };
            }

            case "revenue_trend": {
                const trend = await getRevenueTrend();
                if (!trend || trend.length === 0) {
                    return { content: "Gelir trendi verisi henüz mevcut değil.", data: null, ui_component: null };
                }

                const chartData = trend.map(t => ({
                    name: new Date(t.month).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short' }),
                    revenue: Number(t.revenue),
                    invoice_count: t.invoice_count
                }));

                const totalRevenue = chartData.reduce((sum, t) => sum + t.revenue, 0);

                return {
                    content:
                        `## 📈 Aylık Gelir Trendi\n\n` +
                        `Toplam **${chartData.length}** aylık veri analiz edildi. ` +
                        `Toplam gelir: **${totalRevenue.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**`,
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            case "top_customers": {
                const customers = await getTopCustomers(10);
                if (!customers || customers.length === 0) {
                    return { content: "En iyi müşteri verisi bulunamadı.", data: null, ui_component: null };
                }

                const tableData = customers.map((c, i) => ({
                    sira: i + 1,
                    musteri: c.title,
                    sehir: c.city || '-',
                    toplam_gelir: Number(c.total_revenue).toLocaleString('tr-TR', { maximumFractionDigits: 2 }),
                    fatura_sayisi: c.invoice_count
                }));

                return {
                    content:
                        `## 🏆 En Çok Harcayan Müşteriler (Top 10)\n\n` +
                        `En yüksek gelir sağlayan müşteri: **${customers[0].title}** ` +
                        `(**${Number(customers[0].total_revenue).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**)`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "forecast": {
                const forecastResp = await getForecasts();
                if (!forecastResp.forecasts || forecastResp.forecasts.length === 0) {
                    return {
                        content: "Henüz tahmin verisi yok. Önce modeli eğitmeniz gerekiyor (`/forecasts/train`).",
                        data: null,
                        ui_component: null
                    };
                }

                const chartData = forecastResp.forecasts.map(f => ({
                    name: new Date(f.forecast_date).toLocaleDateString('tr-TR', { year: 'numeric', month: 'short' }),
                    predicted_value: Number(f.predicted_value),
                    lower_bound: f.lower_bound ? Number(f.lower_bound) : null,
                    upper_bound: f.upper_bound ? Number(f.upper_bound) : null
                }));

                const avgForecast = chartData.reduce((s, f) => s + f.predicted_value, 0) / chartData.length;

                return {
                    content:
                        `## 🔮 Prophet Satış Tahmini\n\n` +
                        `Model: **${forecastResp.model}** | Tahmin periyodu: **${chartData.length} dönem**\n\n` +
                        `Ortalama tahmini gelir: **${avgForecast.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺**\n\n` +
                        `Grafik güven bandı (alt/üst sınır) ile birlikte gösterilmektedir.`,
                    data: chartData,
                    ui_component: 'forecast_chart'
                };
            }

            case "anomalies": {
                const anomalies = await getRecentAnomalies(20);
                if (!anomalies || anomalies.length === 0) {
                    return { content: "Şu anda tespit edilmiş anomali bulunmuyor.", data: null, ui_component: null };
                }

                const tableData = anomalies.map(a => ({
                    id: a.id,
                    tur: a.entity_type,
                    skor: a.anomaly_score.toFixed(3),
                    tip: a.anomaly_type || '-',
                    aciklama: a.description || '-',
                    tarih: new Date(a.detected_at).toLocaleDateString('tr-TR'),
                    incelendi: a.is_reviewed ? 'Evet' : 'Hayır'
                }));

                const highScoreCount = anomalies.filter(a => a.anomaly_score < -0.5).length;

                return {
                    content:
                        `## 🚨 Anomali Tespiti (Isolation Forest)\n\n` +
                        `Toplam **${anomalies.length}** anomali tespit edildi. ` +
                        `Bunlardan **${highScoreCount}** tanesi yüksek riskli (skor < -0.5) olarak değerlendirildi.\n\n` +
                        `Anomali skoru ne kadar düşükse, sapma o kadar şiddetlidir.`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "segments": {
                const segments = await getSegmentsOverview();
                if (!segments || segments.length === 0) {
                    return { content: "Müşteri segmentasyonu verisi henüz mevcut değil.", data: null, ui_component: null };
                }

                const chartData = segments.map(s => ({
                    name: s.segment_label,
                    customer_count: s.customer_count,
                    avg_recency: Math.round(s.avg_recency),
                    avg_frequency: Math.round(s.avg_frequency),
                    avg_monetary: Number(s.avg_monetary)
                }));

                const totalCustomers = segments.reduce((s, seg) => s + seg.customer_count, 0);

                const segmentDetails = segments.map(s =>
                    `- **${s.segment_label}**: ${s.customer_count} müşteri (Ort. harcama: ${Number(s.avg_monetary).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺)`
                ).join('\n');

                return {
                    content:
                        `## 👥 Müşteri Segmentasyonu (K-Means RFM)\n\n` +
                        `Toplam **${totalCustomers}** müşteri **${segments.length}** segmente ayrıldı:\n\n` +
                        segmentDetails,
                    data: chartData,
                    ui_component: 'segment_chart'
                };
            }

            case "daily_report": {
                const report = await getDailyReport();
                return {
                    content:
                        `## 📋 AI Günlük Rapor\n\n` +
                        `*Model: ${report.model_used} | Token: ${report.tokens_used}*\n\n` +
                        report.content,
                    data: null,
                    ui_component: null
                };
            }

            case "anomaly_report": {
                const report = await getAnomalyReport();
                return {
                    content:
                        `## 🔍 AI Anomali Raporu\n\n` +
                        `*Model: ${report.model_used} | Token: ${report.tokens_used}*\n\n` +
                        report.content,
                    data: null,
                    ui_component: null
                };
            }

            case "forecast_report": {
                const report = await getForecastReport();
                return {
                    content:
                        `## 📊 AI Tahmin Raporu\n\n` +
                        `*Model: ${report.model_used} | Token: ${report.tokens_used}*\n\n` +
                        report.content,
                    data: null,
                    ui_component: null
                };
            }

            default:
                return { content: "Tanınmayan analiz türü.", data: null, ui_component: null };
        }

    } catch (error: any) {
        console.error("Analytics Action Error:", error);

        if (error.message?.includes("ECONNREFUSED")) {
            return {
                content: "⚠️ ERPO analitik platformuna bağlanılamıyor. Lütfen ERPO servisinin (localhost:8000) çalıştığından emin olun.",
                data: null,
                ui_component: null
            };
        }

        return {
            content: "Analitik verisi işlenirken hata oluştu: " + error.message,
            data: null,
            ui_component: null
        };
    }
}
