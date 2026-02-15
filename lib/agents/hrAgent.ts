/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * HR AGENT
 * Specialized in employees, attendances, leaves and HR KPIs.
 *
 * Intent-based architecture:
 * - employee_list: Çalışan listesi
 * - employee_summary: İK özeti / istatistikleri
 * - employee_search: Çalışan arama
 * - department_breakdown: Departman dağılımı (chart)
 * - headcount: Toplam çalışan sayısı (stat)
 * - position_analysis: Pozisyon bazlı analiz
 */

import { searchReadOdoo, countOdoo } from "@/lib/odooClient";
import { withRetry, withTimeout } from "@/lib/utils/errorHandling";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type HrIntent =
    | "employee_list"
    | "employee_summary"
    | "employee_search"
    | "department_breakdown"
    | "headcount"
    | "position_analysis";

const EMPLOYEE_FIELDS = ["id", "name", "work_email", "mobile_phone", "department_id", "job_title"];

export async function processHrQuery(userQuery: string, history: any[]) {
    const lower = userQuery.toLowerCase();

    // --- Hard-coded intents ---
    if (lower.includes("tüm çalışanları listele") || lower.includes("çalışan listesi") || lower.includes("personel listesi")) {
        return executeHrAction("employee_list", userQuery);
    }
    if (lower.includes("toplam çalışan sayısını özetle") || lower.includes("ik özet") || lower.includes("personel özet") || lower.includes("insan kaynakları rapor")) {
        return executeHrAction("employee_summary", userQuery);
    }
    if (lower.includes("çalışan sayısı") || lower.includes("kaç çalışan") || lower.includes("personel sayısı")) {
        return executeHrAction("headcount", userQuery);
    }
    if (lower.includes("departman dağılım") || lower.includes("departman bazlı") || lower.includes("bölüm dağılım")) {
        return executeHrAction("department_breakdown", userQuery);
    }
    if (lower.includes("pozisyon analiz") || lower.includes("unvan dağılım") || lower.includes("görev dağılım")) {
        return executeHrAction("position_analysis", userQuery);
    }
    if (lower.includes("bugün izinli olan çalışanları")) {
        return executeHrAction("employee_list", userQuery);
    }

    // --- LLM-based intent detection ---
    const systemPrompt = `
    Sen bir **İnsan Kaynakları (HR) AI Uzmanısın**. Odoo ERP'de çalışan kayıtları, departman ve pozisyon verilerini analiz ediyorsun.

    MEVCUT ANALİZ TÜRLERİ:
    1. "employee_list" → Çalışan listesi
    2. "employee_summary" → İK özeti ve istatistikleri
    3. "employee_search" → Çalışan arama
    4. "department_breakdown" → Departman dağılımı (grafik)
    5. "headcount" → Toplam çalışan sayısı
    6. "position_analysis" → Pozisyon bazlı analiz

    ÇIKTI FORMATI:
    { "intent": "employee_list", "search_term": null, "reasoning": "Açıklama" }
    `;

    try {
        const response = await withRetry(
            () => withTimeout(
                () => fetch(GROQ_API_URL, {
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
                        max_tokens: 400,
                        response_format: { type: "json_object" }
                    })
                }),
                12000,
                'HR Agent LLM request timed out'
            ),
            { maxRetries: 2, baseDelay: 1000 }
        );

        if (!response.ok) {
            return { content: "İK AI yanıt vermedi.", data: null, ui_component: null };
        }

        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || "{}";

        let parsed: any;
        try {
            parsed = JSON.parse(rawContent);
        } catch {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
            else parsed = { intent: "employee_summary" };
        }

        return executeHrAction(parsed.intent || "employee_summary", userQuery, parsed.search_term);

    } catch (error: any) {
        console.error("HR Agent Error:", error);
        return executeHrAction("employee_summary", userQuery);
    }
}

async function executeHrAction(intent: HrIntent, userQuery: string, searchTerm?: string) {
    try {
        switch (intent) {
            case "employee_list": {
                const data = await searchReadOdoo("hr.employee", [], EMPLOYEE_FIELDS, 200, "name ASC");
                if (!data?.length) {
                    return { content: "Sistemde çalışan kaydı bulunamadı.", data: null, ui_component: null };
                }

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    ad: r.name,
                    email: r.work_email || '-',
                    telefon: r.mobile_phone || '-',
                    departman: Array.isArray(r.department_id) ? r.department_id[1] : (r.department_id || '-'),
                    pozisyon: r.job_title || '-'
                }));

                // Departman sayımı
                const deptCounts: Record<string, number> = {};
                data.forEach((r: any) => {
                    const dept = Array.isArray(r.department_id) ? r.department_id[1] : (r.department_id || 'Belirtilmemiş');
                    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
                });
                const topDept = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0];

                return {
                    content:
                        `## 👥 Çalışan Listesi\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Çalışan | **${data.length}** |\n` +
                        `| En Kalabalık Departman | **${topDept ? `${topDept[0]} (${topDept[1]} kişi)` : '-'}** |\n` +
                        `| Farklı Departman | **${Object.keys(deptCounts).length}** |\n`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "employee_summary": {
                const totalEmployees = await countOdoo("hr.employee", []);

                const employees = await searchReadOdoo(
                    "hr.employee", [], ["department_id", "job_title"], 500, ""
                );

                const deptCounts: Record<string, number> = {};
                const positionCounts: Record<string, number> = {};

                (employees || []).forEach((r: any) => {
                    const dept = Array.isArray(r.department_id) ? r.department_id[1] : (r.department_id || 'Belirtilmemiş');
                    deptCounts[dept] = (deptCounts[dept] || 0) + 1;

                    const position = r.job_title || 'Belirtilmemiş';
                    positionCounts[position] = (positionCounts[position] || 0) + 1;
                });

                const deptCount = Object.keys(deptCounts).length;
                const positionCount = Object.keys(positionCounts).length;
                const topDept = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0];
                const topPosition = Object.entries(positionCounts).sort((a, b) => b[1] - a[1])[0];

                const deptLines = Object.entries(deptCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([dept, count]) => `- **${dept}**: ${count} çalışan`)
                    .join('\n');

                return {
                    content:
                        `## 👥 İnsan Kaynakları Özeti\n\n` +
                        `| Metrik | Değer |\n|--------|-------|\n` +
                        `| Toplam Çalışan | **${totalEmployees}** |\n` +
                        `| Farklı Departman | **${deptCount}** |\n` +
                        `| Farklı Pozisyon | **${positionCount}** |\n` +
                        `| En Kalabalık Departman | **${topDept ? `${topDept[0]} (${topDept[1]})` : '-'}** |\n` +
                        `| En Yaygın Pozisyon | **${topPosition ? `${topPosition[0]} (${topPosition[1]})` : '-'}** |\n\n` +
                        `**Departman Dağılımı (Top 5):**\n${deptLines}`,
                    data: { totalEmployees, deptCount, positionCount },
                    ui_component: null
                };
            }

            case "employee_search": {
                const term = searchTerm || userQuery;
                const data = await searchReadOdoo(
                    "hr.employee", [["name", "ilike", term]], EMPLOYEE_FIELDS, 20, "name ASC"
                );
                if (!data?.length) {
                    return { content: `"${term}" ile eşleşen çalışan bulunamadı.`, data: null, ui_component: null };
                }
                const tableData = data.map((r: any) => ({
                    ad: r.name,
                    email: r.work_email || '-',
                    telefon: r.mobile_phone || '-',
                    departman: Array.isArray(r.department_id) ? r.department_id[1] : (r.department_id || '-'),
                    pozisyon: r.job_title || '-'
                }));
                return {
                    content: `## 🔍 Çalışan Arama: "${term}"\n\n**${data.length}** sonuç bulundu.`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "department_breakdown": {
                const employees = await searchReadOdoo(
                    "hr.employee", [], ["department_id"], 500, ""
                );
                if (!employees?.length) {
                    return { content: "Departman analizi için yeterli veri yok.", data: null, ui_component: null };
                }

                const deptCounts: Record<string, number> = {};
                employees.forEach((r: any) => {
                    const dept = Array.isArray(r.department_id) ? r.department_id[1] : (r.department_id || 'Belirtilmemiş');
                    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
                });

                const chartData = Object.entries(deptCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, count]) => ({
                        name: name.length > 20 ? name.substring(0, 20) + '...' : name,
                        calisan_sayisi: count
                    }));

                return {
                    content:
                        `## 📊 Departman Dağılımı\n\n` +
                        `Toplam **${employees.length}** çalışan **${chartData.length}** departmana dağılmış durumda:\n\n` +
                        chartData.map(d => `- **${d.name}**: ${d.calisan_sayisi} çalışan`).join('\n'),
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            case "headcount": {
                const count = await countOdoo("hr.employee", []);
                return {
                    content: `## 👥 Personel Sayısı\n\nŞirket genelinde toplam **${count}** aktif çalışan bulunmaktadır.`,
                    data: { count },
                    ui_component: 'stat'
                };
            }

            case "position_analysis": {
                const employees = await searchReadOdoo(
                    "hr.employee", [], ["job_title"], 500, ""
                );
                if (!employees?.length) {
                    return { content: "Pozisyon analizi için yeterli veri yok.", data: null, ui_component: null };
                }

                const positionCounts: Record<string, number> = {};
                employees.forEach((r: any) => {
                    const pos = r.job_title || 'Belirtilmemiş';
                    positionCounts[pos] = (positionCounts[pos] || 0) + 1;
                });

                const chartData = Object.entries(positionCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15)
                    .map(([name, count]) => ({
                        name: name.length > 25 ? name.substring(0, 25) + '...' : name,
                        calisan_sayisi: count
                    }));

                return {
                    content:
                        `## 💼 Pozisyon Bazlı Analiz\n\n` +
                        `Toplam **${Object.keys(positionCounts).length}** farklı pozisyon tespit edildi:\n\n` +
                        chartData.slice(0, 5).map(d => `- **${d.name}**: ${d.calisan_sayisi} çalışan`).join('\n'),
                    data: chartData,
                    ui_component: 'chart'
                };
            }

            default:
                return executeHrAction("employee_summary", userQuery);
        }

    } catch (error: any) {
        console.error("HR Action Error:", error);
        if (error.message?.includes("ECONNREFUSED")) {
            return { content: "⚠️ Odoo ERP sistemine bağlanılamıyor. Lütfen Odoo servisinin (localhost:8069) çalıştığından emin olun.", data: null, ui_component: null };
        }
        return { content: "İK verisi işlenirken hata oluştu: " + error.message, data: null, ui_component: null };
    }
}
