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
}

export async function routeToAgent(userQuery: string, history: any[]): Promise<AgentRoute> {
    const systemPrompt = `
    Sen bir ERP AI Orchestrator'sın. Kullanıcı taleplerine göre doğru uzman ajanları seçersin.
    
    MEVCUT AJANLAR:
    - **sales**: Satışlar, siparişler, müşteriler, teklifler, gelir.
    - **finance**: Faturalar, ödemeler, borç/alacak, nakit akışı.
    - **inventory**: Stoklar, ürünler, depo durumu, kritik stoklar.
    - **purchasing**: Satın alma siparişleri, tedarikçiler, bekleyen satın almalar, maliyet.
    - **hr**: Çalışanlar, vardiyalar, izinler, İK metrikleri.
    - **crm**: Adaylar (leads), fırsatlar (opportunities), satış hunisi, kazanma oranları.

    GÖREVİN:
    1. Kullanıcı spesifik bir şey sorarsa (örn: "Faturalarım"), SADECE o ajanı seç (["finance"]).
    2. Eğer soru birden fazla alanla ilgiliyse (örn: "Satılan ürünlerin stoğu"), ilgili tüm ajanları seç (["sales", "inventory"]).
    3. **Executive Summary / Şirket Özeti**: Kullanıcı şirket genel durumu, günlük özet, dashboard özeti gibi genel bir rapor isterse en az ["sales", "finance", "inventory"] ajanlarını; gerekliyse ["purchasing"] ve ["crm"] ajanlarını da ekle.
    4. İnsan kaynağı, çalışan, izin gibi konular geçiyorsa mutlaka ["hr"] ajanını ekle.

    KURALLAR:
    - SADECE JSON döndür.
    - agents dizisi boş olamaz.
    - Confidence (0-100) ve Reasoning (neden seçtin) alanlarını doldur.

    ÇIKTI FORMATI:
    {
        "agents": ["sales", "finance", "inventory"],
        "confidence": 100,
        "reasoning": "Kullanıcı şirket genel özeti istedi."
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
                max_tokens: 300,
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
                reasoning: "JSON ayrıştırma hatası (" + (parseError as Error).message + ")"
            };
        }

    } catch (error: any) {
        console.error("Orchestrator Error:", error);
        // Fallback to sales agent
        return {
            agents: ['sales'],
            confidence: 30,
            reasoning: "Hata nedeniyle varsayılan agent seçildi"
        };
    }
}
