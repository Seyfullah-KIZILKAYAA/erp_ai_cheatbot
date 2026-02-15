// Last updated: Multi-Agent System Integration with Memory
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { routeToAgent } from "@/lib/agents/orchestrator";
import { processSalesQuery } from "@/lib/agents/salesAgent";
import { processFinanceQuery } from "@/lib/agents/financeAgent";
import { processInventoryQuery } from "@/lib/agents/inventoryAgent";
import { processPurchasingQuery } from "@/lib/agents/purchasingAgent";
import { processHrQuery } from "@/lib/agents/hrAgent";
import { processCrmQuery } from "@/lib/agents/crmAgent";
import { processAnalyticsQuery } from "@/lib/agents/analyticsAgent";
import { MemoryService } from "@/lib/services/memoryService";
import { Entity } from "@/lib/types/memory";

/**
 * Extract entities from agent response data and store in memory
 */
function extractEntitiesFromResponse(agentResponse: any, agentKey: string, sessionId: string) {
    if (!agentResponse.data || !Array.isArray(agentResponse.data)) return;

    const typeMap: Record<string, Entity['type']> = {
        'res.partner': 'customer',
        'product.product': 'product',
        'sale.order': 'order',
        'account.move': 'invoice',
        'hr.employee': 'employee',
        'crm.lead': 'opportunity',
        'purchase.order': 'order'
    };

    // Infer table name from agent key or data
    let tableName = '';
    if (agentKey === 'sales') tableName = agentResponse.data[0]?.partner_id ? 'res.partner' : 'sale.order';
    if (agentKey === 'finance') tableName = 'account.move';
    if (agentKey === 'inventory') tableName = 'product.product';
    if (agentKey === 'purchasing') tableName = 'purchase.order';
    if (agentKey === 'hr') tableName = 'hr.employee';
    if (agentKey === 'crm') tableName = 'crm.lead';

    const entityType = typeMap[tableName];
    if (!entityType) return;

    // Extract and store entities
    agentResponse.data.slice(0, 20).forEach((record: any) => {
        const entity: Entity = {
            id: `${entityType}-${record.id}`,
            type: entityType,
            name: record.name || record.partner_id?.[1] || `${entityType} ${record.id}`,
            odooId: record.id,
            metadata: record,
            mentionedAt: new Date()
        };
        MemoryService.addEntity(sessionId, entity);
    });
}

export async function POST(req: Request) {
    try {
        const { message, history, userContext, sessionId } = await req.json();

        const username = userContext?.username || 'Kullanıcı';
        const activeSessionId = sessionId || 'default';

        console.log(`\n🎯 [ORCHESTRATOR] New query from ${username}: "${message}" (session: ${activeSessionId})`);

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
            forcedAgents = ["sales", "finance", "inventory", "purchasing", "crm", "analytics"];
        } else if (
            lower.includes("tahmin") || lower.includes("forecast") || lower.includes("prophet") ||
            lower.includes("anomali") || lower.includes("anormallik") || lower.includes("sapma") ||
            lower.includes("segment") || lower.includes("rfm") || lower.includes("kümeleme") ||
            lower.includes("k-means") || lower.includes("isolation forest") ||
            lower.includes("gelir trendi") || lower.includes("trend") ||
            lower.includes("kpi") || lower.includes("ml ") || lower.includes("makine öğrenmesi") ||
            lower.includes("yapay zeka raporu") || lower.includes("ai rapor") ||
            lower.includes("günlük rapor") || lower.includes("analitik") || lower.includes("erpo")
        ) {
            forcedAgents = ["analytics"];
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

        // Build memory context from previous entities
        const memoryContext = MemoryService.buildContextPrompt(activeSessionId);
        const messageWithContext = message + memoryContext;

        // Use Promise.allSettled for graceful degradation (partial success support)
        const settledResults = await Promise.allSettled(
            uniqueAgents.map(async (agentKey) => {
                const key = agentKey.toLowerCase();
                // ... (rest of the mapping code stays same)
                if (key === 'finance') {
                    const name = '💰 Finance Agent';
                    console.log(`💰 [FINANCE AGENT] Processing query...`);
                    const res = await processFinanceQuery(messageWithContext, history);
                    return { key, name, ...res };
                }
                if (key === 'inventory') {
                    const name = '📦 Inventory Agent';
                    console.log(`📦 [INVENTORY AGENT] Processing query...`);
                    const res = await processInventoryQuery(messageWithContext, history);
                    return { key, name, ...res };
                }
                if (key === 'purchasing' || key === 'purchase') {
                    const name = '🧾 Purchasing Agent';
                    console.log(`🧾 [PURCHASING AGENT] Processing query...`);
                    const res = await processPurchasingQuery(messageWithContext, history);
                    return { key, name, ...res };
                }
                if (key === 'hr' || key === 'human_resources') {
                    const name = '👥 HR Agent';
                    console.log(`👥 [HR AGENT] Processing query...`);
                    const res = await processHrQuery(messageWithContext, history);
                    return { key, name, ...res };
                }
                if (key === 'crm') {
                    const name = '📈 CRM Agent';
                    console.log(`📈 [CRM AGENT] Processing query...`);
                    const res = await processCrmQuery(messageWithContext, history);
                    return { key, name, ...res };
                }
                if (key === 'analytics') {
                    const name = '🔬 Analytics Agent';
                    console.log(`🔬 [ANALYTICS AGENT] Processing query...`);
                    const res = await processAnalyticsQuery(messageWithContext, history);
                    return { key, name, ...res };
                }
                const name = '💼 Sales Agent';
                console.log(`💼 [SALES AGENT] Processing query...`);
                const res = await processSalesQuery(messageWithContext, history);
                return { key, name, ...res };
            })
        );

        // Extract successful results and log failures
        const agentResults: any[] = [];
        settledResults.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                agentResults.push(result.value);
                // Extract entities from successful agent responses
                extractEntitiesFromResponse(result.value, result.value.key, activeSessionId);
            } else {
                console.error(`❌ [ORCHESTRATOR] Agent ${uniqueAgents[idx]} failed:`, result.reason);
                // Add partial failure indicator
                agentResults.push({
                    key: uniqueAgents[idx],
                    name: `⚠️ ${uniqueAgents[idx].toUpperCase()} Agent`,
                    content: `Bu agent geçici olarak yanıt veremedi. Diğer departmanlardan gelen verileri inceleyebilirsiniz.`,
                    data: null,
                    ui_component: null,
                    agentError: true
                });
            }
        });

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
