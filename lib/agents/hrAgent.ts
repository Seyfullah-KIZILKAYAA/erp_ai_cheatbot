/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * HR AGENT
 * Specialized in employees, attendances and leaves
 */

import { searchReadOdoo, countOdoo } from "@/lib/odooClient";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export async function processHrQuery(userQuery: string, history: any[]) {
    const lower = userQuery.toLowerCase();

    // Hard-coded intent: basic headcount summary
    if (lower.includes("bugün izinli olan çalışanları") || lower.includes("toplam çalışan sayısını özetle")) {
        const action = {
            type: "query",
            table: "hr.employee",
            filters: [],
            fields: ["id", "name", "work_email", "mobile_phone", "department_id", "job_title"],
            limit: 200,
            order: "name ASC",
            display: "table"
        };
        return executeHrOdooAction(JSON.stringify(action), userQuery);
    }

    const systemPrompt = `
    Sen bir **İK / HR AI Uzmanısın**. Odoo ERP'de çalışan kayıtlarını analiz ediyorsun.

    TABLOLAR:
    - hr.employee (Çalışan kartları)

    KURALLAR:
    - SADECE JSON döndür.

    ÇIKTI ÖRNEĞİ:
    {
        "type": "query",
        "table": "hr.employee",
        "filters": [],
        "fields": ["name", "work_email", "mobile_phone", "department_id"],
        "limit": 50,
        "order": "name ASC",
        "display": "table"
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
                    ...history.slice(-5).map((msg: any) => ({
                        role: msg.role === 'bot' ? 'assistant' : 'user',
                        content: msg.content
                    })),
                    { role: "user", content: userQuery }
                ],
                temperature: 0.1,
                max_tokens: 600,
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            return {
                content: "İK AI yanıt vermedi.",
                data: null,
                ui_component: null
            };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        return await executeHrOdooAction(rawContent, userQuery);

    } catch (error: any) {
        console.error("HR Agent Error:", error);
        return {
            content: "İK verileri alınamadı.",
            data: null,
            ui_component: null
        };
    }
}

async function executeHrOdooAction(rawContent: string, userQuery: string) {
    try {
        let action: any;
        try {
            action = JSON.parse(rawContent);
        } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) action = JSON.parse(jsonMatch[0]);
            else throw new Error("No JSON");
        }

        if (!action.type) action.type = "query";
        if (!action.table) action.table = "hr.employee";

        const allowedTables = ["hr.employee"];
        if (!allowedTables.includes(action.table)) {
            action.table = "hr.employee";
        }

        const buildOdooDomain = (filters: any[]) => {
            if (!filters) return [];

            const baseFieldsByTable: Record<string, string[]> = {
                "hr.employee": ["id", "name", "work_email", "mobile_phone", "department_id", "job_title"]
            };
            const allowedColumns = baseFieldsByTable[action.table] || [];

            return filters
                .filter((f: any) => f && typeof f.column === "string" && f.column.trim() && allowedColumns.includes(f.column))
                .map((f: any) => {
                    if (f.operator === 'ilike') return [f.column, 'ilike', f.value];
                    if (f.operator === 'eq') return [f.column, '=', f.value];
                    if (f.operator === 'gt') return [f.column, '>', f.value];
                    if (f.operator === 'lt') return [f.column, '<', f.value];
                    if (f.operator === 'gte') return [f.column, '>=', f.value];
                    if (f.operator === 'lte') return [f.column, '<=', f.value];
                    return [f.column, '=', f.value];
                });
        };

        if (action.type === "count") {
            const domain = buildOdooDomain(action.filters);
            const count = await countOdoo(action.table, domain);
            return {
                content: `**İK Raporu:** Toplam **${count}** kayıt bulundu.`,
                data: { count },
                ui_component: "stat"
            };
        }

        const baseFieldsByTable: Record<string, string[]> = {
            "hr.employee": ["id", "name", "work_email", "mobile_phone", "department_id", "job_title"]
        };

        const domain = buildOdooDomain(action.filters);
        const requestedFields: string[] = Array.isArray(action.fields) ? action.fields : [];
        const allowedFields = baseFieldsByTable[action.table] || [];

        let fields: string[];
        if (requestedFields.length > 0) {
            fields = requestedFields.filter(f => allowedFields.includes(f));
            if (fields.length === 0) fields = allowedFields;
        } else {
            fields = allowedFields;
        }

        const data = await searchReadOdoo(
            action.table,
            domain,
            fields,
            action.limit || 50,
            action.order || ""
        );

        if (!data || data.length === 0) {
            return {
                content: "Bu kriterlere uygun İK verisi bulunamadı.",
                data: null,
                ui_component: null
            };
        }

        const count = data.length;
        const content =
            `Toplam **${count}** çalışan kaydı listelendi. ` +
            `Departman ve pozisyon detaylarını aşağıdaki tabloda görebilirsiniz.`;

        return {
            content,
            data,
            ui_component: action.display || "table"
        };

    } catch (error: any) {
        console.error("HR Action Error:", error);
        return {
            content: "İK verisi işlenirken hata oluştu: " + error.message,
            data: null,
            ui_component: null
        };
    }
}

