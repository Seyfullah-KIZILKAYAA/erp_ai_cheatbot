// Last updated: Multi-Agent System Integration
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { routeToAgent } from "@/lib/agents/orchestrator";
import { processSalesQuery } from "@/lib/agents/salesAgent";
import { processFinanceQuery } from "@/lib/agents/financeAgent";
import { processInventoryQuery } from "@/lib/agents/inventoryAgent";
import { processPurchasingQuery } from "@/lib/agents/purchasingAgent";
import { processHrQuery } from "@/lib/agents/hrAgent";
import { processCrmQuery } from "@/lib/agents/crmAgent";

export async function POST(req: Request) {
    try {
        const { message, history, userContext } = await req.json();

        const username = userContext?.username || 'Kullanıcı';

        console.log(`\n🎯 [ORCHESTRATOR] New query from ${username}: "${message}"`);

        const lower = message.toLowerCase();

        // Step 1: Rule-based routing for known intents (dashboard cards & sık kullanılan komutlar)
        let forcedAgents: string[] | null = null;

        if (lower.includes("tüm müşterileri listele")) {
            forcedAgents = ["sales"];
        } else if (lower.includes("satış siparişlerini listele") || lower.includes("taslak teklifleri listele")) {
            forcedAgents = ["sales"];
        } else if (lower.includes("tüm ürünleri listele")) {
            forcedAgents = ["inventory"];
        } else if (lower.includes("bekleyen satın alma siparişlerini")) {
            forcedAgents = ["purchasing"];
        } else if (lower.includes("bugün izinli olan çalışanları") || lower.includes("toplam çalışan sayısını özetle")) {
            forcedAgents = ["hr"];
        } else if (lower.includes("açık crm fırsatlarını")) {
            forcedAgents = ["crm"];
        } else if (lower.includes("şirket özetini çıkar") || lower.includes("şirket özeti")) {
            // Executive summary: çoklu ajan
            forcedAgents = ["sales", "finance", "inventory", "purchasing", "crm"];
        }

        // Step 1: Orchestrator decides which agent(s) to use (veya rule-based override)
        const route = forcedAgents
            ? {
                agents: forcedAgents,
                confidence: 100,
                analysis: "Önceden tanımlı iş komutu algılandı, ilgili departmanlar doğrudan görevlendirildi.",
                reasoning: "Kullanıcı spesifik bir sistem komutu kullandı."
            }
            : await routeToAgent(message, history);

        console.log(`🧠 [ORCHESTRATOR] Routing decision:`, route);

        // Step 2: Process query with selected agent(s)
        const uniqueAgents = Array.from(new Set(route.agents));

        // Eğer orchestrator hiçbir şey döndürmediyse, satış agent'ına defaultla
        if (uniqueAgents.length === 0) {
            uniqueAgents.push('sales');
        }

        console.log(`🧩 [ORCHESTRATOR] Executing agents:`, uniqueAgents);

        const agentResults = await Promise.all(
            uniqueAgents.map(async (agentKey) => {
                const key = agentKey.toLowerCase();
                // ... (rest of the mapping code stays same)
                if (key === 'finance') {
                    const name = '💰 Finance Agent';
                    console.log(`💰 [FINANCE AGENT] Processing query...`);
                    const res = await processFinanceQuery(message, history);
                    return { key, name, ...res };
                }
                if (key === 'inventory') {
                    const name = '📦 Inventory Agent';
                    console.log(`📦 [INVENTORY AGENT] Processing query...`);
                    const res = await processInventoryQuery(message, history);
                    return { key, name, ...res };
                }
                if (key === 'purchasing' || key === 'purchase') {
                    const name = '🧾 Purchasing Agent';
                    console.log(`🧾 [PURCHASING AGENT] Processing query...`);
                    const res = await processPurchasingQuery(message, history);
                    return { key, name, ...res };
                }
                if (key === 'hr' || key === 'human_resources') {
                    const name = '👥 HR Agent';
                    console.log(`👥 [HR AGENT] Processing query...`);
                    const res = await processHrQuery(message, history);
                    return { key, name, ...res };
                }
                if (key === 'crm') {
                    const name = '📈 CRM Agent';
                    console.log(`📈 [CRM AGENT] Processing query...`);
                    const res = await processCrmQuery(message, history);
                    return { key, name, ...res };
                }
                const name = '💼 Sales Agent';
                console.log(`💼 [SALES AGENT] Processing query...`);
                const res = await processSalesQuery(message, history);
                return { key, name, ...res };
            })
        );

        // Step 3: Merge responses into a unified message
        const multiAgent = uniqueAgents.length > 1;
        const isSummary = message.toLowerCase().includes('özet') || message.toLowerCase().includes('rapor');
        const headerEmoji = route.confidence >= 80 ? '✅' : '🤔';

        const finalContentParts = agentResults.map((result) => {
            return `### ${result.name} ${headerEmoji}\n\n${result.content}`;
        });

        let finalContent = "";

        // Orchestrator Analysis Section
        const orchestratorAnalysis = `> **🧠 Orchestrator Analizi:** ${route.analysis}\n\n`;

        if (multiAgent) {
            const orchestratorHeader = isSummary
                ? `## 📊 Yönetici Özeti\n*Talebiniz tüm departmanlar tarafından analiz edildi ve aşağıdaki rapor hazırlandı.*\n\n`
                : `**🔀 Multi-Agent Workflow:** Talebiniz için birden fazla departman paralel olarak çalıştı.\n\n`;

            finalContent = orchestratorAnalysis + orchestratorHeader + finalContentParts.join(`\n\n---\n\n`);
        } else {
            // Tek bir agent olsa bile analizi gösterelim ki "Orchestrator" hissi korunsun
            finalContent = orchestratorAnalysis + finalContentParts[0];
        }

        const primaryResult = agentResults[0];
        const agentLabel = agentResults.map(r => r.name).join(', ');

        console.log(`✅ [ORCHESTRATOR] Response generated by: ${agentLabel}`);

        return NextResponse.json({
            role: "bot",
            content: finalContent,
            data: primaryResult.data,
            ui_component: primaryResult.ui_component,
            metadata: {
                agent: agentLabel,
                confidence: route.confidence,
                reasoning: route.reasoning,
                analysis: route.analysis,
                multi_agent: multiAgent
            }
        });

    } catch (error: any) {
        console.error("❌ [API ERROR]:", error);
        return NextResponse.json({
            role: "bot",
            content: "Bir hata oluştu: " + error.message
        });
    }
}
