// Last updated: Multi-Agent System Integration with Memory
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/utils/rateLimiter";
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
import { PendingWriteAction } from "@/lib/types/writeConfirmation";
import { searchData, createRecord, updateRecord, getTables } from "@/lib/dataAccess";

/**
 * Extract entities from agent response data and store in memory
 */
function extractEntitiesFromResponse(agentResponse: any, agentKey: string, sessionId: string) {
    if (!agentResponse.data || !Array.isArray(agentResponse.data)) return;

    const typeMap: Record<string, Entity['type']> = {
        [getTables().customers]: 'customer',
        [getTables().products]: 'product',
        [getTables().salesOrders]: 'order',
        [getTables().invoices]: 'invoice',
        [getTables().employees]: 'employee',
        [getTables().crmLeads]: 'opportunity',
        [getTables().purchaseOrders]: 'order'
    };

    // Infer table name from agent key or data
    let tableName = '';
    if (agentKey === 'sales') tableName = agentResponse.data[0]?.partner_id ? getTables().customers : getTables().salesOrders;
    if (agentKey === 'finance') tableName = getTables().invoices;
    if (agentKey === 'inventory') tableName = getTables().products;
    if (agentKey === 'purchasing') tableName = getTables().purchaseOrders;
    if (agentKey === 'hr') tableName = getTables().employees;
    if (agentKey === 'crm') tableName = getTables().crmLeads;

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

async function executeConfirmedWrite(action: PendingWriteAction) {
    try {
        switch (action.actionType) {
            case 'create_customer': {
                const newId = await createRecord(getTables().customers, action.values);
                const created = await searchData(getTables().customers, [['id', '=', newId]],
                    ['id', 'name', 'email', 'phone', 'city', 'is_company'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Müşteri Başarıyla Oluşturuldu!\n\n` +
                        `**ID:** ${newId} | **Ad:** ${action.values.name}\n\nKayıt Odoo'da başarıyla oluşturuldu.`,
                    data: created,
                    ui_component: 'table'
                };
            }
            case 'create_employee': {
                const values = { ...action.values };
                if (values.department_name) {
                    const depts = await searchData(getTables().departments,
                        [['name', 'ilike', values.department_name]], ['id', 'name'], 1);
                    if (depts?.length) {
                        values.department_id = depts[0].id;
                    }
                    delete values.department_name;
                }
                if (values.company_name) {
                    const companies = await searchData(getTables().companies,
                        [['name', 'ilike', values.company_name]], ['id', 'name'], 1);
                    if (companies?.length) {
                        values.company_id = companies[0].id;
                    }
                    delete values.company_name;
                }
                const newId = await createRecord(getTables().employees, values);
                const created = await searchData(getTables().employees, [['id', '=', newId]],
                    ['id', 'name', 'work_email', 'mobile_phone', 'department_id', 'job_title', 'company_id'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Personel Başarıyla Oluşturuldu!\n\n` +
                        `**ID:** ${newId} | **Ad:** ${action.values.name}`,
                    data: created,
                    ui_component: 'table'
                };
            }
            case 'update_employee': {
                const values = { ...action.values };
                const employeeName = values.employee_name;
                delete values.employee_name;

                // Find the employee
                const employees = await searchData(getTables().employees,
                    [['name', 'ilike', employeeName]], ['id', 'name'], 1);
                if (!employees?.length) {
                    return {
                        role: 'bot',
                        content: `"${employeeName}" adında personel bulunamadı.`,
                        data: null, ui_component: null
                    };
                }

                // Resolve company_name -> company_id
                if (values.company_name) {
                    const companies = await searchData(getTables().companies,
                        [['name', 'ilike', values.company_name]], ['id', 'name'], 1);
                    if (companies?.length) {
                        values.company_id = companies[0].id;
                    } else {
                        return {
                            role: 'bot',
                            content: `"${values.company_name}" adında şirket bulunamadı.`,
                            data: null, ui_component: null
                        };
                    }
                    delete values.company_name;
                }

                // Resolve department_name -> department_id
                if (values.department_name) {
                    const depts = await searchData(getTables().departments,
                        [['name', 'ilike', values.department_name]], ['id', 'name'], 1);
                    if (depts?.length) {
                        values.department_id = depts[0].id;
                    }
                    delete values.department_name;
                }

                await updateRecord(getTables().employees, [employees[0].id], values);
                const updated = await searchData(getTables().employees, [['id', '=', employees[0].id]],
                    ['id', 'name', 'work_email', 'mobile_phone', 'department_id', 'job_title', 'company_id'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Personel Başarıyla Güncellendi!\n\n` +
                        `**${employeeName}** bilgileri güncellendi.`,
                    data: updated,
                    ui_component: 'table'
                };
            }
            case 'create_product': {
                const newId = await createRecord(getTables().products, action.values);
                const created = await searchData(getTables().products, [['id', '=', newId]],
                    ['id', 'name', 'qty_available', 'list_price', 'default_code'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Ürün Başarıyla Oluşturuldu!\n\n` +
                        `**ID:** ${newId} | **Ürün:** ${action.values.name}`,
                    data: created,
                    ui_component: 'table'
                };
            }
            case 'create_order': {
                const partners = await searchData(getTables().customers,
                    [['name', 'ilike', action.values.partner_name]], ['id', 'name'], 1);
                if (!partners?.length) {
                    return {
                        role: 'bot',
                        content: `"${action.values.partner_name}" adında müşteri bulunamadı. Önce müşteri oluşturun.`,
                        data: null, ui_component: null
                    };
                }
                const newId = await createRecord(getTables().salesOrders, { partner_id: partners[0].id });
                const created = await searchData(getTables().salesOrders, [['id', '=', newId]],
                    ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Satış Siparişi Oluşturuldu!\n\n` +
                        `**Sipariş No:** ${created[0]?.name || newId} | **Müşteri:** ${partners[0].name}`,
                    data: created,
                    ui_component: 'table'
                };
            }
            case 'create_invoice': {
                const partners = await searchData(getTables().customers,
                    [['name', 'ilike', action.values.partner_name]], ['id', 'name'], 1);
                if (!partners?.length) {
                    return {
                        role: 'bot',
                        content: `"${action.values.partner_name}" adında müşteri bulunamadı.`,
                        data: null, ui_component: null
                    };
                }
                const newId = await createRecord(getTables().invoices, { partner_id: partners[0].id, move_type: 'out_invoice' });
                const created = await searchData(getTables().invoices, [['id', '=', newId]],
                    ['id', 'name', 'partner_id', 'amount_total', 'payment_state', 'state', 'invoice_date'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Fatura Oluşturuldu!\n\n` +
                        `**Fatura No:** ${created[0]?.name || newId} | **Müşteri:** ${partners[0].name}`,
                    data: created,
                    ui_component: 'table'
                };
            }
            case 'create_purchase': {
                const vendors = await searchData(getTables().customers,
                    [['name', 'ilike', action.values.partner_name], ['is_company', '=', true]], ['id', 'name'], 1);
                if (!vendors?.length) {
                    return {
                        role: 'bot',
                        content: `"${action.values.partner_name}" adında tedarikçi bulunamadı.`,
                        data: null, ui_component: null
                    };
                }
                const newId = await createRecord(getTables().purchaseOrders, { partner_id: vendors[0].id });
                const created = await searchData(getTables().purchaseOrders, [['id', '=', newId]],
                    ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Satın Alma Siparişi Oluşturuldu!\n\n` +
                        `**Sipariş No:** ${created[0]?.name || newId}`,
                    data: created,
                    ui_component: 'table'
                };
            }
            case 'create_lead': {
                const values = { ...action.values };
                if (values.partner_name) {
                    const partners = await searchData(getTables().customers,
                        [['name', 'ilike', values.partner_name]], ['id'], 1);
                    if (partners?.length) values.partner_id = partners[0].id;
                    delete values.partner_name;
                }
                const newId = await createRecord(getTables().crmLeads, values);
                const created = await searchData(getTables().crmLeads, [['id', '=', newId]],
                    ['id', 'name', 'partner_id', 'stage_id', 'probability', 'expected_revenue'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ CRM Fırsatı Oluşturuldu!\n\n` +
                        `**ID:** ${newId} | **Fırsat:** ${action.values.name}`,
                    data: created,
                    ui_component: 'table'
                };
            }
            case 'confirm_order': {
                const orders = await searchData(getTables().salesOrders,
                    [['name', 'ilike', action.values.order_name], ['state', '=', 'draft']],
                    ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order'], 1);
                if (!orders?.length) {
                    return {
                        role: 'bot',
                        content: `"${action.values.order_name}" numaralı taslak sipariş bulunamadı.`,
                        data: null, ui_component: null
                    };
                }
                await updateRecord(getTables().salesOrders, [orders[0].id], { state: 'sale' });
                return {
                    role: 'bot',
                    content: `## ✅ Sipariş Onaylandı!\n\n**${orders[0].name}** siparişi başarıyla onaylandı.`,
                    data: null,
                    ui_component: null
                };
            }
            case 'update_customer': {
                const values = { ...action.values };
                const customerName = values.customer_name;
                delete values.customer_name;

                const customers = await searchData(getTables().customers,
                    [['name', 'ilike', customerName]], ['id', 'name'], 1);
                if (!customers?.length) {
                    return {
                        role: 'bot',
                        content: `"${customerName}" adında müşteri bulunamadı.`,
                        data: null, ui_component: null
                    };
                }

                await updateRecord(getTables().customers, [customers[0].id], values);
                const updated = await searchData(getTables().customers, [['id', '=', customers[0].id]],
                    ['id', 'name', 'email', 'phone', 'city', 'is_company'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Müşteri Başarıyla Güncellendi!\n\n**${customerName}** bilgileri güncellendi.`,
                    data: updated,
                    ui_component: 'table'
                };
            }
            case 'update_product': {
                const values = { ...action.values };
                const productName = values.product_name;
                delete values.product_name;

                const products = await searchData(getTables().products,
                    [['name', 'ilike', productName]], ['id', 'name'], 1);
                if (!products?.length) {
                    return {
                        role: 'bot',
                        content: `"${productName}" adında ürün bulunamadı.`,
                        data: null, ui_component: null
                    };
                }

                await updateRecord(getTables().products, [products[0].id], values);
                const updated = await searchData(getTables().products, [['id', '=', products[0].id]],
                    ['id', 'name', 'qty_available', 'list_price', 'default_code'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Ürün Başarıyla Güncellendi!\n\n**${productName}** bilgileri güncellendi.`,
                    data: updated,
                    ui_component: 'table'
                };
            }
            case 'update_invoice': {
                const values = { ...action.values };
                const invoiceName = values.invoice_name;
                delete values.invoice_name;

                const invoices = await searchData(getTables().invoices,
                    [['name', 'ilike', invoiceName]], ['id', 'name'], 1);
                if (!invoices?.length) {
                    return {
                        role: 'bot',
                        content: `"${invoiceName}" numaralı fatura bulunamadı.`,
                        data: null, ui_component: null
                    };
                }

                // Resolve partner_name -> partner_id
                if (values.partner_name) {
                    const partners = await searchData(getTables().customers,
                        [['name', 'ilike', values.partner_name]], ['id', 'name'], 1);
                    if (partners?.length) {
                        values.partner_id = partners[0].id;
                    } else {
                        return {
                            role: 'bot',
                            content: `"${values.partner_name}" adında müşteri bulunamadı.`,
                            data: null, ui_component: null
                        };
                    }
                    delete values.partner_name;
                }

                await updateRecord(getTables().invoices, [invoices[0].id], values);
                const updated = await searchData(getTables().invoices, [['id', '=', invoices[0].id]],
                    ['id', 'name', 'partner_id', 'amount_total', 'payment_state', 'state', 'invoice_date'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Fatura Başarıyla Güncellendi!\n\n**${invoiceName}** bilgileri güncellendi.`,
                    data: updated,
                    ui_component: 'table'
                };
            }
            case 'update_purchase': {
                const values = { ...action.values };
                const poName = values.po_name;
                delete values.po_name;

                const pos = await searchData(getTables().purchaseOrders,
                    [['name', 'ilike', poName]], ['id', 'name'], 1);
                if (!pos?.length) {
                    return {
                        role: 'bot',
                        content: `"${poName}" numaralı satın alma siparişi bulunamadı.`,
                        data: null, ui_component: null
                    };
                }

                // Resolve partner_name -> partner_id
                if (values.partner_name) {
                    const vendors = await searchData(getTables().customers,
                        [['name', 'ilike', values.partner_name], ['is_company', '=', true]], ['id', 'name'], 1);
                    if (vendors?.length) {
                        values.partner_id = vendors[0].id;
                    } else {
                        return {
                            role: 'bot',
                            content: `"${values.partner_name}" adında tedarikçi bulunamadı.`,
                            data: null, ui_component: null
                        };
                    }
                    delete values.partner_name;
                }

                await updateRecord(getTables().purchaseOrders, [pos[0].id], values);
                const updated = await searchData(getTables().purchaseOrders, [['id', '=', pos[0].id]],
                    ['id', 'name', 'partner_id', 'amount_total', 'state', 'date_order'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ Satın Alma Siparişi Güncellendi!\n\n**${poName}** bilgileri güncellendi.`,
                    data: updated,
                    ui_component: 'table'
                };
            }
            case 'update_lead': {
                const values = { ...action.values };
                const leadName = values.lead_name;
                delete values.lead_name;

                const leads = await searchData(getTables().crmLeads,
                    [['name', 'ilike', leadName]], ['id', 'name'], 1);
                if (!leads?.length) {
                    return {
                        role: 'bot',
                        content: `"${leadName}" adında CRM fırsatı bulunamadı.`,
                        data: null, ui_component: null
                    };
                }

                // Resolve partner_name -> partner_id
                if (values.partner_name) {
                    const partners = await searchData(getTables().customers,
                        [['name', 'ilike', values.partner_name]], ['id', 'name'], 1);
                    if (partners?.length) {
                        values.partner_id = partners[0].id;
                    }
                    delete values.partner_name;
                }

                // Resolve stage_name -> stage_id
                if (values.stage_name) {
                    const stages = await searchData(getTables().crmStages,
                        [['name', 'ilike', values.stage_name]], ['id', 'name'], 1);
                    if (stages?.length) {
                        values.stage_id = stages[0].id;
                    }
                    delete values.stage_name;
                }

                await updateRecord(getTables().crmLeads, [leads[0].id], values);
                const updated = await searchData(getTables().crmLeads, [['id', '=', leads[0].id]],
                    ['id', 'name', 'partner_id', 'stage_id', 'probability', 'expected_revenue'], 1);
                return {
                    role: 'bot',
                    content: `## ✅ CRM Fırsatı Güncellendi!\n\n**${leadName}** bilgileri güncellendi.`,
                    data: updated,
                    ui_component: 'table'
                };
            }
            default:
                return { role: 'bot', content: 'Bilinmeyen işlem tipi.', data: null, ui_component: null };
        }
    } catch (error: any) {
        console.error('❌ [WRITE CONFIRM] Error:', error);
        return {
            role: 'bot',
            content: `Kayıt oluşturulurken hata oluştu: ${error.message}`,
            data: null,
            ui_component: null
        };
    }
}

const MAX_MESSAGE_LENGTH = 5000;
const MAX_HISTORY_LENGTH = 100;

export async function POST(req: Request) {
    try {
        // Rate limiting (20 requests per minute per session)
        const clientIp = req.headers.get('x-forwarded-for') || 'anonymous';
        const rateCheck = checkRateLimit(clientIp, 20, 60_000);
        if (!rateCheck.allowed) {
            return NextResponse.json(
                { role: "bot", content: "Cok fazla istek gonderdiniz. Lutfen biraz bekleyin." },
                { status: 429 }
            );
        }

        const body = await req.json();
        const { message, history, userContext, sessionId, writeEnabled, writeAction } = body;
        const isWriteEnabled = writeEnabled === true;

        // Handle write confirmation action
        if (message === '__WRITE_CONFIRM__' && writeAction) {
            if (!isWriteEnabled) {
                return NextResponse.json({
                    role: 'bot',
                    content: '**Yazma izni kapalı.** Lütfen Ayarlar panelinden **Yazma İşlevi** seçeneğini aktif edin.',
                    data: null,
                    ui_component: null
                });
            }
            console.log(`📝 [WRITE CONFIRM] Executing: ${writeAction.actionType} (${writeAction.actionId})`);
            const result = await executeConfirmedWrite(writeAction);
            return NextResponse.json(result);
        }

        // Input validation
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return NextResponse.json({ role: "bot", content: "Lutfen bir mesaj girin." }, { status: 400 });
        }
        if (message.length > MAX_MESSAGE_LENGTH) {
            return NextResponse.json({ role: "bot", content: `Mesaj cok uzun. Maksimum ${MAX_MESSAGE_LENGTH} karakter.` }, { status: 400 });
        }
        const safeHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_LENGTH) : [];

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
            : await routeToAgent(message, safeHistory);

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
                if (key === 'finance') {
                    const name = '💰 Finance Agent';
                    console.log(`💰 [FINANCE AGENT] Processing query... (writeEnabled: ${isWriteEnabled})`);
                    const res = await processFinanceQuery(messageWithContext, history, isWriteEnabled);
                    return { key, name, ...res };
                }
                if (key === 'inventory') {
                    const name = '📦 Inventory Agent';
                    console.log(`📦 [INVENTORY AGENT] Processing query... (writeEnabled: ${isWriteEnabled})`);
                    const res = await processInventoryQuery(messageWithContext, history, isWriteEnabled);
                    return { key, name, ...res };
                }
                if (key === 'purchasing' || key === 'purchase') {
                    const name = '🧾 Purchasing Agent';
                    console.log(`🧾 [PURCHASING AGENT] Processing query... (writeEnabled: ${isWriteEnabled})`);
                    const res = await processPurchasingQuery(messageWithContext, history, isWriteEnabled);
                    return { key, name, ...res };
                }
                if (key === 'hr' || key === 'human_resources') {
                    const name = '👥 HR Agent';
                    console.log(`👥 [HR AGENT] Processing query... (writeEnabled: ${isWriteEnabled})`);
                    const res = await processHrQuery(messageWithContext, history, isWriteEnabled);
                    return { key, name, ...res };
                }
                if (key === 'crm') {
                    const name = '📈 CRM Agent';
                    console.log(`📈 [CRM AGENT] Processing query... (writeEnabled: ${isWriteEnabled})`);
                    const res = await processCrmQuery(messageWithContext, history, isWriteEnabled);
                    return { key, name, ...res };
                }
                if (key === 'analytics') {
                    const name = '🔬 Analytics Agent';
                    console.log(`🔬 [ANALYTICS AGENT] Processing query...`);
                    const res = await processAnalyticsQuery(messageWithContext, history);
                    return { key, name, ...res };
                }
                // Default: Sales Agent (with write support)
                const name = '💼 Sales Agent';
                console.log(`💼 [SALES AGENT] Processing query... (writeEnabled: ${isWriteEnabled})`);
                const res = await processSalesQuery(messageWithContext, history, isWriteEnabled);
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
        const safeMessage = process.env.NODE_ENV === 'development'
            ? `Bir hata oluştu: ${error.message}`
            : 'Bir hata oluştu. Lütfen daha sonra tekrar deneyin.';
        return NextResponse.json({
            role: "bot",
            content: safeMessage
        }, { status: 500 });
    }
}
