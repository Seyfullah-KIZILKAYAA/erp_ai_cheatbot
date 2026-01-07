import { NextResponse } from "next/server";
import { searchReadOdoo, countOdoo } from "@/lib/odooClient";

// Groq API Config
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Returns the ERP schema for the AI to understand available models and fields.
 */
function getDatabaseSchema(): string {
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

/**
 * Converts AI-generated filters to Odoo Domain format.
 */
const buildOdooDomain = (filters: any[]) => {
    if (!filters) return [];
    return filters.map((f: any) => {
        switch (f.operator) {
            case 'ilike': return [f.column, 'ilike', f.value];
            case 'eq': return [f.column, '=', f.value];
            case 'gt': return [f.column, '>', f.value];
            case 'lt': return [f.column, '<', f.value];
            default: return [f.column, '=', f.value];
        }
    });
};

export async function POST(req: Request) {
    try {
        const { message, history } = await req.json();
        const schemaDescription = getDatabaseSchema();

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
            "type": "query",
            "table": "model_adi",
            "filters": [
                { "column": "name", "operator": "ilike", "value": "Ahmet" }
            ],
            "fields": ["name", "email"],
            "limit": 10,
            "display": "table" 
        }
        
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
                messages,
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
                const action = JSON.parse(jsonMatch[0]);

                if (action.type === 'count') {
                    const domain = buildOdooDomain(action.filters);
                    const count = await countOdoo(action.table, domain);
                    finalResponse = `Toplam kayıt sayısı: **${count}**`;
                    responseData = { count };
                    uiType = 'stat';
                }
                else if (action.type === 'query') {
                    const domain = buildOdooDomain(action.filters);
                    const fields = action.fields || ['name'];
                    const data = await searchReadOdoo(action.table, domain, fields, action.limit || 10);

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
                                    { role: "system", content: "Gelen veriyi kısa ve öz şekilde kullanıcıya açıkla." },
                                    { role: "user", content: `VERİLER: ${JSON.stringify(data).slice(0, 1500)}\n\nSoru: ${message}` }
                                ]
                            })
                        });
                        const summaryData = await summaryRes.json();
                        finalResponse = summaryData.choices[0]?.message?.content || "Veriler getirildi.";
                    }
                }
            }
        } catch (e) {
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
