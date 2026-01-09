// Last updated: Add Odoo ERP Integration
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { searchReadOdoo, countOdoo } from "@/lib/odooClient";

// Groq API Config
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

async function getDatabaseSchema() {
    // Odoo Modelleri ve Alanları (AI'ın bilmesi gerekenler)
    return `
    MEVCUT ERP TABLOLARI (Odoo):
    1. res.partner (Müşteriler/Contacts)
       - Alanlar: name, email, phone, city, country_id, is_company
    
    2. sale.order (Satış Siparişleri)
       - Alanlar: name, partner_id, date_order, amount_total, state (draft, sale, done)
    
    3. product.product (Ürünler)
       - Alanlar: name, lst_price (satış fiyatı), qty_available (stok), default_code (kod)
       
    NOT: Tablo isimlerini (res.partner, sale.order vb.) tam olarak bu şekilde kullan.
    `;
}

export async function POST(req: Request) {
    try {
        const { message, history } = await req.json();

        const schemaDescription = await getDatabaseSchema();

        const systemPrompt = `
        Sen uzman bir Odoo ERP Asistanısın. Şu anki tarih: ${new Date().toLocaleString('tr-TR')}
        
        GÖREVİN:
        Kullanıcının sorularını yanıtlamak için Odoo veritabanından veri çekmelisin.
        Aşağıdaki şemayı kullan:
        
        ${schemaDescription}

        KULLANIM KURALLARI:
        1. Kullanıcının sorusunu analiz et.
        2. Eğer veri gerekiyorsa, aşağıdaki JSON formatında sorgu üret.
        3. Tablo adlarını ve alanları mutlaka şemadan al.

        JSON FORMATI:
        {
            "type": "query", // veya sayım için "count"
            "table": "model_adi" (örn: res.partner),
            "filters": [ // Odoo domain mantığına çevrilecek filtreler
                { "column": "name", "operator": "ilike", "value": "Ahmet" }
            ],
            "fields": ["name", "email"], // İstenen alanlar
            "limit": 10,
            "order": "amount_total desc", // Sıralama (isteğe bağlı)
            "display": "table" // veya "stat" veya "chart"
        }
        
        GÖRSELLEŞTİRME KURALLARI:
        - Liste verileri için "table".
        - Tek bir sayı/miktar için "stat".
        - Karşılaştırmalar veya sayısal trendler için "chart".
        
        FİLTRE OPERATÖRLERİ: eq (=), ilike (içerir), gt (>), lt (<)
        
        Eğer sohbet devam ediyorsa ve veri gerekmiyorsa normal cevap ver (JSON döndürme).
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
                    const data = await searchReadOdoo(
                        action.table,
                        domain,
                        fields,
                        action.limit || 10,
                        action.order || ''
                    );

                    if (!data || data.length === 0) {
                        finalResponse = "Kriterlere uygun kayıt bulunamadı.";
                    } else {
                        responseData = data;
                        uiType = action.display || 'table';

                        // Summarize results for the user
                        const summaryRes = await fetch(GROQ_API_URL, {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                            body: JSON.stringify({
                                model: "llama-3.3-70b-versatile",
                                messages: [
                                    {
                                        role: "system",
                                        content: "Gelen veriyi kısa ve öz bir şekilde kullanıcıya açıkla. ÖNEMLİ: Tablodaki tüm satırları tek tek metin olarak listeleme, çünkü veriler zaten bir tablo içinde gösterilecek. Sadece genel bir özet ve varsa önemli bir bulguyu söyle."
                                    },
                                    { role: "user", content: `VERİLER: ${JSON.stringify(data).slice(0, 1500)}\n\nKullanıcının Sorusu: ${message}` }
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
            // Hata olsa bile metni döndür
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
