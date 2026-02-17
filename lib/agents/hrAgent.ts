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

import { searchData, countData, getTables, getFields, getValue, getNumericValue, getField, getConnectionLabel, getConnectionErrorMessage, getRawValue } from "@/lib/dataAccess";
import { buildWriteConfirmationResponse } from "@/lib/utils/writeConfirmationHelper";
import { withRetry, withTimeout } from "@/lib/utils/errorHandling";
import { extractWriteData } from "@/lib/utils/writeHelper";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type HrIntent =
    | "employee_list"
    | "employee_summary"
    | "employee_search"
    | "department_breakdown"
    | "headcount"
    | "position_analysis"
    | "create_employee"
    | "update_employee";

// Dynamic field resolution
const getEmployeeFields = () => getFields('employees', ['id', 'name', 'email', 'phone', 'department', 'jobTitle']);

export async function processHrQuery(userQuery: string, history: any[], writeEnabled: boolean = false) {
    const lower = userQuery.toLowerCase();

    // --- Hard-coded intents for WRITE operations ---
    if (lower.includes("personel oluştur") || lower.includes("personel ekle") || lower.includes("çalışan oluştur") || lower.includes("çalışan ekle") || lower.includes("yeni personel") || lower.includes("yeni çalışan") || lower.includes("personel eklenecek")) {
        return executeHrAction("create_employee", userQuery, undefined, writeEnabled);
    }
    if (lower.includes("personeli taşı") || lower.includes("personeli güncelle") || lower.includes("çalışanı taşı") || lower.includes("çalışanı güncelle") || lower.includes("şirketine taşı") || lower.includes("şirketine ata") || lower.includes("departmanını değiştir") || lower.includes("personeli transfer")) {
        return executeHrAction("update_employee", userQuery, undefined, writeEnabled);
    }

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
    const connLabel = getConnectionLabel();
    const systemPrompt = `
    Sen bir **İnsan Kaynakları (HR) AI Uzmanısın**. ${connLabel}'de çalışan kayıtları, departman ve pozisyon verilerini analiz ediyorsun.

    MEVCUT ANALİZ TÜRLERİ:
    1. "employee_list" → Çalışan listesi
    2. "employee_summary" → İK özeti ve istatistikleri
    3. "employee_search" → Çalışan arama
    4. "department_breakdown" → Departman dağılımı (grafik)
    5. "headcount" → Toplam çalışan sayısı
    6. "position_analysis" → Pozisyon bazlı analiz
    7. "create_employee" → Yeni personel oluşturma
    8. "update_employee" → Personel bilgilerini güncelleme (şirket taşıma, departman değiştirme vb.)

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

        return executeHrAction(parsed.intent || "employee_summary", userQuery, parsed.search_term, writeEnabled);

    } catch (error: any) {
        console.error("HR Agent Error:", error);
        return executeHrAction("employee_summary", userQuery);
    }
}

async function executeHrAction(intent: HrIntent, userQuery: string, searchTerm?: string, writeEnabled: boolean = false) {
    try {
        switch (intent) {
            case "employee_list": {
                const data = await searchData(getTables().employees, [], getEmployeeFields(), 200, `${getField('employees', 'name')} ASC`);
                if (!data?.length) {
                    return { content: "Sistemde çalışan kaydı bulunamadı.", data: null, ui_component: null };
                }

                const tableData = data.map((r: any, i: number) => ({
                    sira: i + 1,
                    ad: getValue(r, 'employees', 'name'),
                    email: getValue(r, 'employees', 'email'),
                    telefon: getValue(r, 'employees', 'phone'),
                    departman: getValue(r, 'employees', 'department'),
                    pozisyon: getValue(r, 'employees', 'jobTitle')
                }));

                // Departman sayımı
                const deptCounts: Record<string, number> = {};
                data.forEach((r: any) => {
                    const dept = getValue(r, 'employees', 'department', 'Belirtilmemiş');
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
                const totalEmployees = await countData(getTables().employees, []);

                const employees = await searchData(
                    getTables().employees, [], [getField('employees', 'department'), getField('employees', 'jobTitle')], 500, ""
                );

                const deptCounts: Record<string, number> = {};
                const positionCounts: Record<string, number> = {};

                (employees || []).forEach((r: any) => {
                    const dept = getValue(r, 'employees', 'department', 'Belirtilmemiş');
                    deptCounts[dept] = (deptCounts[dept] || 0) + 1;

                    const position = getValue(r, 'employees', 'jobTitle', 'Belirtilmemiş');
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
                const data = await searchData(
                    getTables().employees, [[getField('employees', 'name'), "ilike", term]], getEmployeeFields(), 20, `${getField('employees', 'name')} ASC`
                );
                if (!data?.length) {
                    return { content: `"${term}" ile eşleşen çalışan bulunamadı.`, data: null, ui_component: null };
                }
                const tableData = data.map((r: any) => ({
                    ad: getValue(r, 'employees', 'name'),
                    email: getValue(r, 'employees', 'email'),
                    telefon: getValue(r, 'employees', 'phone'),
                    departman: getValue(r, 'employees', 'department'),
                    pozisyon: getValue(r, 'employees', 'jobTitle')
                }));
                return {
                    content: `## 🔍 Çalışan Arama: "${term}"\n\n**${data.length}** sonuç bulundu.`,
                    data: tableData,
                    ui_component: 'table'
                };
            }

            case "department_breakdown": {
                const employees = await searchData(
                    getTables().employees, [], [getField('employees', 'department')], 500, ""
                );
                if (!employees?.length) {
                    return { content: "Departman analizi için yeterli veri yok.", data: null, ui_component: null };
                }

                const deptCounts: Record<string, number> = {};
                employees.forEach((r: any) => {
                    const dept = getValue(r, 'employees', 'department', 'Belirtilmemiş');
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
                const count = await countData(getTables().employees, []);
                return {
                    content: `## 👥 Personel Sayısı\n\nŞirket genelinde toplam **${count}** aktif çalışan bulunmaktadır.`,
                    data: { count },
                    ui_component: 'stat'
                };
            }

            case "position_analysis": {
                const employees = await searchData(
                    getTables().employees, [], [getField('employees', 'jobTitle')], 500, ""
                );
                if (!employees?.length) {
                    return { content: "Pozisyon analizi için yeterli veri yok.", data: null, ui_component: null };
                }

                const positionCounts: Record<string, number> = {};
                employees.forEach((r: any) => {
                    const pos = getValue(r, 'employees', 'jobTitle', 'Belirtilmemiş');
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

            // --- WRITE OPERATIONS (Onay sistemi ile) ---
            case "create_employee": {
                if (!writeEnabled) {
                    return {
                        content: "**Yazma izni kapalı.** Personel oluşturmak için Ayarlar panelinden **Yazma İşlevi** seçeneğini aktif edin.",
                        data: null,
                        ui_component: null
                    };
                }

                const empData = await extractWriteData(userQuery, `Kullanıcının mesajından çalışan/personel bilgilerini çıkar. JSON formatında döndür.
Alanlar: name (zorunlu), work_email, mobile_phone, department_name, job_title, company_name (şirket adı, opsiyonel).
Sadece JSON döndür, başka bir şey yazma.
Örnek: {"name": "Ahmet Yılmaz", "work_email": "ahmet@test.com", "job_title": "Yönetici", "company_name": "TR Company"}
Eğer yeterli bilgi yoksa {"name": null} döndür.`);

                if (!empData || !empData.name) {
                    return {
                        content: "Personel oluşturmak için en azından isim gerekli.\n\n**Örnek:**\n- \"Yeni personel ekle: Ahmet Yılmaz, ahmet@test.com, Yönetici\"\n- \"Çalışan oluştur: Ayşe Demir, IT departmanı, Yazılım Geliştirici\"",
                        data: null,
                        ui_component: null
                    };
                }

                return buildWriteConfirmationResponse('create_employee', 'hr', empData);
            }

            case "update_employee": {
                if (!writeEnabled) {
                    return {
                        content: "**Yazma izni kapalı.** Personel güncellemek için Ayarlar panelinden **Yazma İşlevi** seçeneğini aktif edin.",
                        data: null,
                        ui_component: null
                    };
                }

                const updateData = await extractWriteData(userQuery, `Kullanıcının mesajından personel güncelleme bilgilerini çıkar. JSON formatında döndür.
Alanlar: employee_name (güncellenecek personelin mevcut adı, zorunlu), company_name (yeni şirket adı), department_name (yeni departman adı), job_title (yeni pozisyon), work_email (yeni e-posta), mobile_phone (yeni telefon).
Sadece değişecek alanları ekle. Değişmeyen alanları ekleme.
Sadece JSON döndür, başka bir şey yazma.
Örnek: {"employee_name": "Ahmet Yılmaz", "company_name": "TR Company"}
Eğer personel adı bulunamadıysa {"employee_name": null} döndür.`);

                if (!updateData || !updateData.employee_name) {
                    return {
                        content: "Personel güncellemek için personel adı gerekli.\n\n**Örnek:**\n- \"Test personelini TR Company şirketine taşı\"\n- \"Ahmet Yılmaz'ın departmanını IT olarak değiştir\"",
                        data: null,
                        ui_component: null
                    };
                }

                return buildWriteConfirmationResponse('update_employee', 'hr', updateData);
            }

            default:
                return executeHrAction("employee_summary", userQuery);
        }

    } catch (error: any) {
        console.error("HR Action Error:", error);
        if (error.message?.includes("ECONNREFUSED")) {
            return { content: getConnectionErrorMessage(), data: null, ui_component: null };
        }
        return { content: "İK verisi işlenirken hata oluştu: " + error.message, data: null, ui_component: null };
    }
}
