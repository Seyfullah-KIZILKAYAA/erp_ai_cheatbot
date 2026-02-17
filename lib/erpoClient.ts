/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ERPO CLIENT
 * Analytics engine powered by Odoo ERP data + Groq AI.
 * Pulls all data from the same Odoo instance used by other agents.
 * KPIs, trends, forecasts, anomalies, segments and AI reports — all from Odoo.
 */

import { searchData, countData, getTables } from "@/lib/dataAccess";
import {
    SYSTEM_PROMPT,
    buildDailyReportPrompt,
    buildAnomalyReportPrompt,
    buildForecastReportPrompt,
} from "@/lib/erpoPrompts";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ─── Types ────────────────────────────────────────────────────

export interface KpiSummary {
    total_revenue: number;
    total_orders: number;
    active_customers: number;
    avg_order_value: number;
    mom_growth_pct: number | null;
    anomaly_count: number;
}

export interface RevenueTrendItem {
    month: string;
    revenue: number;
    invoice_count: number;
}

export interface TopCustomer {
    id: number;
    title: string;
    city: string | null;
    total_revenue: number;
    invoice_count: number;
}

export interface ForecastItem {
    forecast_date: string;
    predicted_value: number;
    lower_bound: number | null;
    upper_bound: number | null;
}

export interface ForecastResponse {
    model: string;
    forecasts: ForecastItem[];
}

export interface AnomalyItem {
    id: number;
    entity_type: string;
    entity_id: number;
    anomaly_score: number;
    anomaly_type: string | null;
    description: string | null;
    detected_at: string;
    is_reviewed: boolean;
}

export interface SegmentOverview {
    segment_id: number;
    segment_label: string;
    customer_count: number;
    avg_recency: number;
    avg_frequency: number;
    avg_monetary: number;
}

export interface NarrativeResponse {
    report_type: string;
    content: string;
    model_used: string;
    tokens_used: number;
}

// ─── Odoo Data Helpers ────────────────────────────────────────

async function fetchInvoices(): Promise<any[]> {
    const data = await searchData(
        getTables().invoices,
        [["move_type", "=", "out_invoice"], ["state", "=", "posted"]],
        ["id", "name", "partner_id", "amount_total", "invoice_date", "payment_state"],
        5000, "invoice_date DESC"
    );
    return data || [];
}

function groupByMonth(invoices: any[]): Map<string, { revenue: number; count: number }> {
    const map = new Map<string, { revenue: number; count: number }>();
    for (const inv of invoices) {
        if (!inv.invoice_date) continue;
        const key = inv.invoice_date.substring(0, 7); // "YYYY-MM"
        const existing = map.get(key) || { revenue: 0, count: 0 };
        existing.revenue += Number(inv.amount_total || 0);
        existing.count += 1;
        map.set(key, existing);
    }
    return map;
}

function getPartnerId(field: any): number {
    return Array.isArray(field) ? field[0] : (field || 0);
}

function getPartnerName(field: any): string {
    return Array.isArray(field) ? field[1] : String(field || "-");
}

// ─── Dashboard Queries ────────────────────────────────────────

export async function getKpiSummary(): Promise<KpiSummary> {
    const [invoices, orderCount, customerCount] = await Promise.all([
        fetchInvoices(),
        countData(getTables().salesOrders, [["state", "=", "sale"]]),
        countData(getTables().customers, [["customer_rank", ">", 0]]),
    ]);

    const totalRevenue = invoices.reduce((s: number, i: any) => s + Number(i.amount_total || 0), 0);
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

    // Month-over-Month growth
    const now = new Date();
    const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    const monthly = groupByMonth(invoices);
    const thisMonthRev = monthly.get(thisMonthKey)?.revenue || 0;
    const lastMonthRev = monthly.get(lastMonthKey)?.revenue || 0;
    const momGrowth = lastMonthRev > 0 ? ((thisMonthRev - lastMonthRev) / lastMonthRev) * 100 : null;

    // Anomaly detection: invoices with amount > mean + 2*stddev
    let anomalyCount = 0;
    if (invoices.length > 2) {
        const amounts = invoices.map((i: any) => Number(i.amount_total || 0));
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const variance = amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / amounts.length;
        const stddev = Math.sqrt(variance);
        const threshold = mean + 2 * stddev;
        anomalyCount = amounts.filter(a => a > threshold).length;
    }

    return {
        total_revenue: totalRevenue,
        total_orders: orderCount,
        active_customers: customerCount,
        avg_order_value: Math.round(avgOrderValue * 100) / 100,
        mom_growth_pct: momGrowth !== null ? Math.round(momGrowth * 10) / 10 : null,
        anomaly_count: anomalyCount,
    };
}

export async function getRevenueTrend(): Promise<RevenueTrendItem[]> {
    const invoices = await fetchInvoices();
    const monthly = groupByMonth(invoices);

    return Array.from(monthly.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, data]) => ({
            month: `${month}-01`,
            revenue: data.revenue,
            invoice_count: data.count,
        }));
}

export async function getTopCustomers(limit: number = 10): Promise<TopCustomer[]> {
    const invoices = await fetchInvoices();

    // Aggregate by partner
    const customerMap = new Map<number, { title: string; revenue: number; count: number }>();
    for (const inv of invoices) {
        const pid = getPartnerId(inv.partner_id);
        const pname = getPartnerName(inv.partner_id);
        if (!pid) continue;
        const existing = customerMap.get(pid) || { title: pname, revenue: 0, count: 0 };
        existing.revenue += Number(inv.amount_total || 0);
        existing.count += 1;
        customerMap.set(pid, existing);
    }

    // Get customer city info
    const topIds = Array.from(customerMap.entries())
        .sort((a, b) => b[1].revenue - a[1].revenue)
        .slice(0, limit)
        .map(([id]) => id);

    let cityMap: Record<number, string> = {};
    if (topIds.length > 0) {
        const partners = await searchData(
            getTables().customers,
            [["id", "in", topIds]],
            ["id", "city"],
            limit, ""
        );
        if (partners) {
            for (const p of partners) {
                cityMap[p.id] = p.city || null;
            }
        }
    }

    return topIds.map(id => {
        const data = customerMap.get(id)!;
        return {
            id,
            title: data.title,
            city: cityMap[id] || null,
            total_revenue: data.revenue,
            invoice_count: data.count,
        };
    });
}

// ─── Forecast (Simple Moving Average + Linear Trend) ─────────

export async function getForecasts(): Promise<ForecastResponse> {
    const trend = await getRevenueTrend();
    if (trend.length < 3) {
        return { model: "moving_average", forecasts: [] };
    }

    // Calculate linear trend from last 6 months
    const recent = trend.slice(-6);
    const n = recent.length;
    const avgRevenue = recent.reduce((s, t) => s + t.revenue, 0) / n;

    // Simple slope: (last - first) / n
    const slope = (recent[n - 1].revenue - recent[0].revenue) / n;

    // Generate 3 months forecast
    const forecasts: ForecastItem[] = [];
    const lastDate = new Date(recent[n - 1].month);

    for (let i = 1; i <= 3; i++) {
        const forecastDate = new Date(lastDate);
        forecastDate.setMonth(forecastDate.getMonth() + i);
        const predicted = Math.max(0, avgRevenue + slope * i);
        const margin = avgRevenue * 0.15; // 15% confidence band

        forecasts.push({
            forecast_date: forecastDate.toISOString().split("T")[0],
            predicted_value: Math.round(predicted * 100) / 100,
            lower_bound: Math.round(Math.max(0, predicted - margin) * 100) / 100,
            upper_bound: Math.round((predicted + margin) * 100) / 100,
        });
    }

    return { model: "moving_average", forecasts };
}

// ─── Anomaly Detection (Statistical) ─────────────────────────

export async function getRecentAnomalies(limit: number = 50): Promise<AnomalyItem[]> {
    const invoices = await fetchInvoices();
    if (invoices.length < 5) return [];

    const amounts = invoices.map((i: any) => Number(i.amount_total || 0));
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / amounts.length;
    const stddev = Math.sqrt(variance);

    const anomalies: AnomalyItem[] = [];
    for (const inv of invoices) {
        const amount = Number(inv.amount_total || 0);
        const deviation = (amount - mean) / (stddev || 1);

        if (Math.abs(deviation) > 2) {
            const score = -Math.abs(deviation) / 10; // Negative = more anomalous

            let anomalyType: string;
            if (amount > mean + 2 * stddev) anomalyType = "unusual_high_amount";
            else if (amount < mean - 2 * stddev) anomalyType = "unusual_low_amount";
            else anomalyType = "statistical_outlier";

            anomalies.push({
                id: inv.id,
                entity_type: "invoice",
                entity_id: inv.id,
                anomaly_score: Math.round(score * 1000) / 1000,
                anomaly_type: anomalyType,
                description: `${inv.name || "Fatura"} — ${amount.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ₺ (ortalamadan ${deviation > 0 ? "+" : ""}${deviation.toFixed(1)}σ sapma)`,
                detected_at: inv.invoice_date || new Date().toISOString(),
                is_reviewed: false,
            });
        }
    }

    return anomalies
        .sort((a, b) => a.anomaly_score - b.anomaly_score)
        .slice(0, limit);
}

// ─── Customer Segmentation (RFM) ─────────────────────────────

export async function getSegmentsOverview(): Promise<SegmentOverview[]> {
    const invoices = await fetchInvoices();
    if (invoices.length < 5) return [];

    const now = new Date();

    // Calculate RFM per customer
    const rfmMap = new Map<number, { lastDate: Date; frequency: number; monetary: number }>();
    for (const inv of invoices) {
        const pid = getPartnerId(inv.partner_id);
        if (!pid) continue;
        const date = new Date(inv.invoice_date);
        const amount = Number(inv.amount_total || 0);
        const existing = rfmMap.get(pid);
        if (existing) {
            if (date > existing.lastDate) existing.lastDate = date;
            existing.frequency += 1;
            existing.monetary += amount;
        } else {
            rfmMap.set(pid, { lastDate: date, frequency: 1, monetary: amount });
        }
    }

    const customers = Array.from(rfmMap.entries()).map(([id, data]) => ({
        id,
        recency: Math.floor((now.getTime() - data.lastDate.getTime()) / (1000 * 60 * 60 * 24)),
        frequency: data.frequency,
        monetary: data.monetary,
    }));

    if (customers.length < 5) return [];

    // Simple quintile-based segmentation
    const sortedByRecency = [...customers].sort((a, b) => a.recency - b.recency);
    const sortedByFrequency = [...customers].sort((a, b) => b.frequency - a.frequency);
    const sortedByMonetary = [...customers].sort((a, b) => b.monetary - a.monetary);

    const getQuintile = (arr: typeof customers, item: typeof customers[0]) => {
        const idx = arr.findIndex(c => c.id === item.id);
        return Math.min(4, Math.floor((idx / arr.length) * 5));
    };

    const SEGMENT_LABELS: Record<number, string> = {
        0: "Champions",
        1: "Loyal Customers",
        2: "Potential Loyalists",
        3: "At Risk",
        4: "Hibernating",
    };

    const segmentBuckets: Record<number, { recency: number[]; frequency: number[]; monetary: number[] }> = {};
    for (let i = 0; i < 5; i++) segmentBuckets[i] = { recency: [], frequency: [], monetary: [] };

    for (const c of customers) {
        const rQ = getQuintile(sortedByRecency, c);
        const fQ = getQuintile(sortedByFrequency, c);
        const mQ = getQuintile(sortedByMonetary, c);

        const avgQ = Math.round((rQ + fQ + mQ) / 3);
        const segId = Math.min(4, avgQ);

        segmentBuckets[segId].recency.push(c.recency);
        segmentBuckets[segId].frequency.push(c.frequency);
        segmentBuckets[segId].monetary.push(c.monetary);
    }

    return Object.entries(segmentBuckets)
        .filter(([, data]) => data.recency.length > 0)
        .map(([segId, data]) => {
            const n = data.recency.length;
            return {
                segment_id: parseInt(segId),
                segment_label: SEGMENT_LABELS[parseInt(segId)] || `Segment ${segId}`,
                customer_count: n,
                avg_recency: Math.round(data.recency.reduce((a, b) => a + b, 0) / n),
                avg_frequency: Math.round((data.frequency.reduce((a, b) => a + b, 0) / n) * 10) / 10,
                avg_monetary: Math.round(data.monetary.reduce((a, b) => a + b, 0) / n),
            };
        });
}

// ─── Groq Narrative Helper ────────────────────────────────────

async function callGroq(userPrompt: string): Promise<NarrativeResponse> {
    const response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
            ],
            max_tokens: 800,
            temperature: 0.3,
        }),
    });

    if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
    }

    const data = await response.json();
    return {
        report_type: "",
        content: data.choices[0]?.message?.content || "",
        model_used: GROQ_MODEL,
        tokens_used: data.usage?.total_tokens || 0,
    };
}

// ─── Narrative Reports ────────────────────────────────────────

export async function getDailyReport(): Promise<NarrativeResponse> {
    const [kpi, trend, anomalies, forecasts] = await Promise.all([
        getKpiSummary(),
        getRevenueTrend(),
        getRecentAnomalies(5),
        getForecasts(),
    ]);

    const last7 = trend.slice(-7);
    const weeklyTrend = last7.length > 0
        ? last7.map(t => `- ${new Date(t.month).toLocaleDateString("tr-TR", { year: "numeric", month: "short" })}: ${t.revenue.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL (${t.invoice_count} fatura)`).join("\n")
        : "Trend verisi mevcut değil.";

    const anomalyDetails = anomalies.length > 0
        ? anomalies.map(a => `- [${a.entity_type}#${a.entity_id}] Skor: ${a.anomaly_score.toFixed(3)} | ${a.anomaly_type || "-"} | ${a.description || "-"}`).join("\n")
        : "Aktif anomali bulunmuyor.";

    const forecastSummary = forecasts.forecasts.length > 0
        ? forecasts.forecasts.map(f => `- ${new Date(f.forecast_date).toLocaleDateString("tr-TR")}: ${f.predicted_value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL`).join("\n")
        : "Tahmin verisi mevcut değil.";

    const prompt = buildDailyReportPrompt({
        date: new Date().toLocaleDateString("tr-TR"),
        total_revenue: kpi.total_revenue.toLocaleString("tr-TR", { maximumFractionDigits: 2 }),
        invoice_count: kpi.total_orders,
        avg_invoice: kpi.avg_order_value.toLocaleString("tr-TR", { maximumFractionDigits: 2 }),
        active_customers: kpi.active_customers,
        anomaly_count: kpi.anomaly_count,
        weekly_trend: weeklyTrend,
        anomaly_details: anomalyDetails,
        forecast_summary: forecastSummary,
    });

    const result = await callGroq(prompt);
    return { ...result, report_type: "daily" };
}

export async function getAnomalyReport(): Promise<NarrativeResponse> {
    const [anomalies, invoiceCount] = await Promise.all([
        getRecentAnomalies(50),
        countData(getTables().invoices, [["move_type", "=", "out_invoice"], ["state", "=", "posted"]]),
    ]);

    const totalAnomalies = anomalies.length;
    const unreviewed = anomalies.filter(a => !a.is_reviewed).length;
    const totalRisk = anomalies.reduce((s, a) => s + Math.abs(a.anomaly_score), 0);
    const anomalyRate = invoiceCount > 0 ? ((totalAnomalies / invoiceCount) * 100).toFixed(1) : "0";

    const topAnomaliesText = anomalies.slice(0, 5).length > 0
        ? anomalies.slice(0, 5).map((a, i) => `${i + 1}. [${a.entity_type}#${a.entity_id}] Skor: ${a.anomaly_score.toFixed(3)} | Tip: ${a.anomaly_type || "-"} | ${a.description || "-"}`).join("\n")
        : "Anomali bulunmuyor.";

    const prompt = buildAnomalyReportPrompt({
        total_anomalies: totalAnomalies,
        anomaly_rate: anomalyRate,
        total_risk: totalRisk.toLocaleString("tr-TR", { maximumFractionDigits: 2 }),
        unreviewed,
        top_anomalies: topAnomaliesText,
    });

    const result = await callGroq(prompt);
    return { ...result, report_type: "anomaly" };
}

export async function getForecastReport(): Promise<NarrativeResponse> {
    const forecasts = await getForecasts();
    const horizon = forecasts.forecasts.length;

    const forecastData = forecasts.forecasts.length > 0
        ? forecasts.forecasts.map(f =>
            `- ${new Date(f.forecast_date).toLocaleDateString("tr-TR")}: ${f.predicted_value.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} TL [${f.lower_bound?.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) || "?"} - ${f.upper_bound?.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) || "?"}]`
        ).join("\n")
        : "Tahmin verisi mevcut değil.";

    const prompt = buildForecastReportPrompt({
        horizon,
        mae: "N/A",
        mape: "N/A",
        forecast_data: forecastData,
    });

    const result = await callGroq(prompt);
    return { ...result, report_type: "forecast" };
}

// ─── Health Check ─────────────────────────────────────────────

export async function checkErpoHealth(): Promise<boolean> {
    try {
        const count = await countData(getTables().customers, []);
        return count >= 0;
    } catch {
        return false;
    }
}
