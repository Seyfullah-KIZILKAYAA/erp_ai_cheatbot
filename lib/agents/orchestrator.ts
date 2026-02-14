/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ORCHESTRATOR AGENT
 * Routes user queries to the appropriate specialized agent(s)
 */

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface AgentRoute {
    agents: ('sales' | 'finance' | 'inventory' | 'purchasing' | 'hr' | 'crm')[];
    confidence: number;
    reasoning: string;
    analysis: string; // Brain analysis as shown in the visual
}

export async function routeToAgent(userQuery: string, history: any[]): Promise<AgentRoute> {
    const systemPrompt = `
    Sen bir **Multi-Agent ERP AI Orchestrator** sinir merkezisin.
    Görevin, kullanıcıdan gelen doğal dil sorgularını analiz etmek ve bunları en uygun uzman departman ajanlarına (Agents) yönlendirmektir.

    GÖRSEL MİMARİDEKİ AJANLARIN VE SORUMLULUKLARI:
    1. **CRM Agent**: Adaylar (Leads), Müşteri Temasları (Contacts), Fırsatlar (Opportunities), Satış Hunisi, CRM Fırsatları.
    2. **HR Agent**: Çalışan Bilgileri (Employees), İzinler (Leaves), Vardiyalar/Devamlılık (Attendance), İK Metrikleri, Personel Sayısı.
    3. **Inventory Agent**: Stok Seviyeleri, Ürünler, Depo Hareketleri, Kritik Stok Analizleri, Ürün Listesi.
    4. **Finance Agent**: Faturalar (Invoices), Ödemeler (Payments), Finansal Durum, Borç/Alacak, Mali Tablolar.
    5. **Purchasing Agent**: Satın Alma Siparişleri (PO), Tedarikçiler, Bekleyen Alımlar, Satın Alma İşlemleri.
    6. **Sales Agent**: Satış Siparişleri (Orders), Müşteri Verileri, Gelir Analizi, Teklifler, Taslak Siparişler, Müşteri Listesi.

    YÖNLENDİRME STRATEJİSİ:
    - **Tekil Sorumluluk**: Eğer soru net bir departmanı ilgilendiriyorsa (örn: "Bu ayki faturalar"), sadece ilgili ajanı seç.
    - **Karmaşık / Çoklu Sorumluluk**: Soru birden fazla alanı kapsıyorsa (örn: "En çok satılan ürünün stok durumu"), ilgili tüm ajanları seç (Sales + Inventory).
    - **Yönetici Özeti / Şirket Genel Durumu**: Eğer kullanıcı genel bir rapor veya özet isterse tüm ana departmanları (Sales, Finance, Inventory, Purchasing, CRM) seç.

    ÖNEMLİ ANAHTAR KELİMELER:
    - "müşteri" kelimesi SADECE kullanılıyorsa → Sales Agent
    - "ürün" veya "stok" → Inventory Agent
    - "fatura" veya "ödeme" veya "finans" → Finance Agent
    - "satın alma" veya "tedarikçi" → Purchasing Agent
    - "çalışan" veya "personel" veya "izin" → HR Agent
    - "fırsat" veya "lead" veya "crm" → CRM Agent

    KURAL:
    - SADECE JSON formatında yanıt ver.
    - "analysis" alanında soruyu nasıl anladığını ve neden bu ajanları seçtiğini kısaca açıkla (Analiz cümlesi 1-2 cümle olsun).
    - Güven skoru (confidence) her zaman 80-100 arası olsun, düşük değer verme.

    ÇIKTI FORMATI:
    {
        "agents": ["finance"],
        "confidence": 95,
        "analysis": "Kullanıcı ödenmemiş faturaları sorduğu için Finans departmanı görevlendirildi.",
        "reasoning": "account.move tablosundaki ödeme durumu 'not_paid' olan kayıtları inceleyeceğiz."
    }
    `;

    try {
        const response = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...history.slice(-3).map((msg: any) => ({
                        role: msg.role === 'bot' ? 'assistant' : 'user',
                        content: msg.content
                    })),
                    { role: "user", content: `Kullanıcı Sorusu: "${userQuery}"` }
                ],
                temperature: 0.1,
                max_tokens: 400,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`Orchestrator API Error: ${response.status}`, errText);
            throw new Error(`Orchestrator API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        console.log(`🤖 [ORCHESTRATOR] Raw LLM Response:`, rawContent);

        try {
            const route = JSON.parse(rawContent);
            if (route && Array.isArray(route.agents)) {
                return route as AgentRoute;
            }
            throw new Error("Invalid agents array in response");
        } catch (parseError) {
            console.error("Orchestrator JSON Parse Error:", parseError, rawContent);
            // Fallback: Default to sales
            return {
                agents: ['sales'],
                confidence: 50,
                analysis: "Sorgu analizi sırasında bir hata oluştu, varsayılan olarak Satış departmanına yönlendirildi.",
                reasoning: "JSON ayrıştırma hatası (" + (parseError as Error).message + ")"
            };
        }

    } catch (error: any) {
        console.error("Orchestrator Error:", error);
        // Fallback to sales agent
        return {
            agents: ['sales'],
            confidence: 30,
            analysis: "Sistem hatası nedeniyle sorgu analiz edilemedi.",
            reasoning: "Hata nedeniyle varsayılan agent seçildi"
        };
    }
}
