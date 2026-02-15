/**
 * ERPO NARRATIVE REPORT PROMPTS
 * Turkish prompt templates for Groq AI report generation.
 * Replicated from ERPO's src/narrative/prompt_templates.py
 */

export const SYSTEM_PROMPT = `Sen kıdemli bir ERP operasyon analistisin. Logo Tiger/Go ERP sistemi
analiz verilerini değerlendirip yöneticiler için özlü, eyleme yönelik Türkçe raporlar
yazıyorsun. Her zaman somut sayılar kullan, net öneri ver.
Maksimum 4 paragraf. Teknik jargon kullanma. Yönetici perspektifinden yaz.`;

export function buildDailyReportPrompt(data: {
    date: string;
    total_revenue: string;
    invoice_count: number;
    avg_invoice: string;
    active_customers: number;
    anomaly_count: number;
    weekly_trend: string;
    anomaly_details: string;
    forecast_summary: string;
}): string {
    return `
## Günlük Operasyon Verileri

- Tarih: ${data.date}
- Toplam Gelir: ${data.total_revenue} TL
- Fatura Sayısı: ${data.invoice_count}
- Ortalama Fatura Tutarı: ${data.avg_invoice} TL
- Aktif Müşteri: ${data.active_customers}
- Tespit Edilen Anomali: ${data.anomaly_count}

## Son 7 Günlük Trend
${data.weekly_trend}

## Aktif Anomaliler
${data.anomaly_details}

## Tahmin (Önümüzdeki 7 Gün)
${data.forecast_summary}

Bu verilere dayanarak:
1. Yönetici Özeti (2-3 cümle)
2. Gelir Analizi
3. Dikkat Gerektiren Konular
4. Önerilecek Aksiyonlar

başlıkları altında Türkçe bir yönetici raporu yaz.
Başlık: 'ERPO Günlük Operasyon Raporu — ${data.date}'
`;
}

export function buildAnomalyReportPrompt(data: {
    total_anomalies: number;
    anomaly_rate: string;
    total_risk: string;
    unreviewed: number;
    top_anomalies: string;
}): string {
    return `
## Anomali Analiz Verileri

- Toplam Anomali Sayısı: ${data.total_anomalies}
- Anomali Oranı: %${data.anomaly_rate}
- Toplam Riskli Tutar: ${data.total_risk} TL
- İncelenmemiş Anomali: ${data.unreviewed}

## En Riskli 5 İşlem
${data.top_anomalies}

Bu anomali verilerini analiz edip:
1. Genel Değerlendirme
2. En Yüksek Riskli İşlemlerin Yorumu
3. Olası Nedenler
4. Önerilen Aksiyonlar

başlıkları altında Türkçe rapor yaz.
Başlık: 'ERPO Anomali Raporu'
`;
}

export function buildForecastReportPrompt(data: {
    horizon: number;
    mae: string;
    mape: string;
    forecast_data: string;
}): string {
    return `
## Tahmin Verileri

- Tahmin Modeli: Prophet
- Tahmin Ufku: ${data.horizon} gün
- MAE (Ortalama Mutlak Hata): ${data.mae} TL
- MAPE: %${data.mape}

## Önümüzdeki ${data.horizon} Günlük Tahmin
${data.forecast_data}

Bu tahmin verilerini değerlendir ve:
1. Tahmin Özeti
2. Trend Analizi (artış/düşüş beklentisi)
3. İş Planlama Önerileri
4. Risk Faktörleri

başlıkları altında Türkçe yönetici raporu yaz.
Başlık: 'ERPO Satış Tahmin Raporu'
`;
}
