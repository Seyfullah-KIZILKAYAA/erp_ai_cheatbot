// Last updated: Add Odoo ERP Integration
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { searchReadOdoo, countOdoo } from "@/lib/odooClient";

// Groq API Config
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

async function getDatabaseSchema() {
    return `
    TABLO VE ALAN REHBERİ (Odoo):
    1. res.partner (Müşteriler ve Kişiler)
       - Alanlar: name (Tam ad), email, phone, city, is_company (Şirket mi?), comment (Notlar)
       - İpucu: Müşteri ararken 'name' alanını 'ilike' ile ara.
    
    2. sale.order (Satış Siparişleri/Teklifler)
       - Alanlar: name (Sipariş No, örn: S0001), partner_id (Müşteri), date_order (Tarih), amount_total (Toplam Tutar), state (Durum: draft=teklif, sale=onaylı, done=tamamlanmış)
    
    3. product.product (Ürünler)
       - Alanlar: name (Ürün adı), lst_price (Liste fiyatı), qty_available (Stok miktarı), default_code (Ürün kodu/barkod), type (Ürün tipi)
       
    KRİTİK NOT: 
    - Arama yaparken her zaman 'ilike' kullan (Büyük/küçük harf duyarsızlığı için).
    - Kullanıcı "Teklifleri göster" derse 'state' = 'draft' filtresi ekle.
    - Kullanıcı "Satışları göster" derse 'state' = 'sale' filtresi ekle.
    `;
}

export async function POST(req: Request) {
    try {
        const { message, history } = await req.json();

        const schemaDescription = await getDatabaseSchema();

        const systemPrompt = `
        Sen profesyonel bir Odoo ERP Uzmanısın. Kullanıcının veriye ulaşmasını sağlamak senin birincil görevin.
        "Uygun kayıt bulunamadı" hatasını en aza indirmek için şu stratejileri uygula:
        
        ARAMA STRATEJİLERİ:
        1. **Fuzzy Search (Esnek Arama)**: Metin bazlı aramalarda (isim, email, ürün adı) HER ZAMAN 'ilike' operatörünü kullan. 'eq' operatörünü sadece ID veya tam kod aramalarında kullan.
        2. **Büyük/Küçük Harf**: Odoo 'ilike' operatörü ile büyük/küçük harf duyarsız arama yapar, bu yüzden tercihin her zaman 'ilike' olsun.
        3. **Kapsayıcı Sorgular**: Kullanıcı "Ahmet'i bul" dediğinde sadece tam eşleşme arama, 'ilike' ile "Ahmet" araması yap ki "Ahmet Yılmaz" gibi kayıtlar da gelsin.
        4. **Varsayılan Filtreler**: Eğer kullanıcı tarih belirtmediyse, çok kısıtlayıcı tarih filtreleri koyma.
        
        ${schemaDescription}

        GÖRSELLEŞTİRME VE JSON FORMATI:
        {
            "type": "query",
            "table": "model_adi",
            "filters": [
                { "column": "name", "operator": "ilike", "value": "kelime" }
            ],
            "fields": ["name", "id", ...gereklialanlar],
            "limit": 20,
            "display": "table" | "stat" | "chart" | "trend"
        }

        EĞER KAYIT BULUNAMAZSA:
        Kullanıcıya "Kayıt bulunamadı" demek yerine, "Herhangi bir filtre uygulamadan listeyi görmek ister misiniz?" gibi yönlendirmeler yap veya en yakın sonuçları bulmaya çalış.
        `;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history.map((msg: any) => ({
                role: msg.role === 'bot' ? 'assistant' : 'user',
                content: msg.content
            })),
            { role: "user", content: message }
        ];

        const aiResponse = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: messages,
                temperature: 0.1,
                max_tokens: 1000
            })
        });

        if (!aiResponse.ok) {
            const errData = await aiResponse.json();
            throw new Error(`Groq API Error: ${errData.error?.message || aiResponse.statusText}`);
        }

        const aiData = await aiResponse.json();
        const rawContent = aiData.choices[0]?.message?.content || "";
        let finalResponse = rawContent;
        let responseData = null;
        let uiType = null;

        try {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const jsonContent = jsonMatch[0];
                const action = JSON.parse(jsonContent);

                // Odoo Domain Dönüştürücü
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
                    console.log(`Odoo Count: ${action.table}`, domain);
                    const count = await countOdoo(action.table, domain);

                    finalResponse = `Toplam kayıt sayısı: **${count}**`;
                    responseData = { count };
                    uiType = 'stat';
                }
                else if (action.type === 'query') {
                    const domain = buildOdooDomain(action.filters);
                    const fields = action.fields || ['name'];

                    console.log(`Odoo Search: ${action.table}`, domain);
                    let data = await searchReadOdoo(
                        action.table,
                        domain,
                        fields,
                        action.limit || 10,
                        action.order || ''
                    );

                    // FALLBACK: Eğer veri bulunamadıysa ve bir filtre varsa, filtreyi kaldırıp genel bir liste çekmeyi dene
                    if ((!data || data.length === 0) && domain.length > 0) {
                        console.log(`No results for ${action.table} with filters. Trying fallback (no filters)...`);
                        data = await searchReadOdoo(
                            action.table,
                            [], // No filters
                            fields,
                            5, // Just a few examples
                            action.order || ''
                        );

                        // Mark as fallback data for the summary AI
                        (data as any).isFallback = true;
                    }

                    if (!data || data.length === 0) {
                        finalResponse = "Üzgünüm, aradığın kriterlerde hiçbir kayıt bulunamadı ve veritabanı boş görünüyor.";
                    } else {
                        responseData = data;
                        uiType = (data as any).isFallback ? 'table' : (action.display || 'table');

                        // If it's a trend, we can add a simple linear projection or let the summary AI explain it
                        if (uiType === 'trend' && data.length > 2) {
                            // Simple Forecasting Logic (SMA or Linear)
                            // We will let the summary AI handle the complex interpretation
                        }

                        // Summarize results for the user with Forecasting context
                        const summaryRes = await fetch(GROQ_API_URL, {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                            body: JSON.stringify({
                                model: "llama-3.3-70b-versatile",
                                messages: [
                                    {
                                        role: "system",
                                        content: `Gelen veriyi analiz et ve kullanıcıya açıkla. 
                                        NOT: Eğer gelen veri 'isFallback: true' ise kullanıcıya aradığı spesifik kaydı bulamadığını ama sistemdeki bazı örnek kayıtları getirdiğini belirt. 
                                        Trend analizlerinde (${uiType} === 'trend') geleceğe dair kısa bir tahminde bulun. 
                                        ÖNEMLİ: Tablodaki tüm satırları tek tek metin olarak listeleme.`
                                    },
                                    { role: "user", content: `VERİLER: ${JSON.stringify(data).slice(0, 2000)}\n\nKullanıcının Sorusu: ${message}\nFallback Durumu: ${(data as any).isFallback ? 'EVET (Spesifik sonuç yok, genel örnekler bunlar)' : 'HAYIR (Tam sonuçlar)'}` }
                                ]
                            })
                        });
                        const summaryData = await summaryRes.json();
                        finalResponse = summaryData.choices[0]?.message?.content || "Veriler getirildi.";
                    }
                }
            }
        } catch (e: any) {
            console.error("Action Processing Error:", e);
        }

        return NextResponse.json({
            role: "bot",
            content: finalResponse,
            data: responseData,
            ui_component: uiType
        });

    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json({ role: "bot", content: "Bir hata oluştu: " + error.message });
    }
}
