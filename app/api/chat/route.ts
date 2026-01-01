
// Last updated: Fix syntax error and optimize query logic
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Supabase Setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Groq API Config
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

async function getDatabaseSchema() {
    try {
        // Supabase'den dinamik olarak şema bilgisini çekiyoruz
        // NOT: Bunun çalışması için 'get_schema_info' adlı RPC fonksiyonunun SQL Editor'de çalıştırılmış olması lazım.
        const { data, error } = await supabase.rpc('get_schema_info');

        if (error || !data) {
            console.warn("Schema introspection failed (RPC not found or error):", error);
            // Fallback (Yedek) şema - RPC yoksa en azından bildiklerimizi kullanalım
            return `
    TABLOLAR (Dinamik şema çekilemedi, varsayılanlar):
    1. products (id, name, stock_quantity, sales_count, price, category)
    2. sales (id, product_id, quantity, sale_date, total_amount)
    
    UYARI: Veritabanı yapısını tam öğrenmek için 'setup_schema_introspection.sql' dosyasındaki kodu Supabase SQL Editor'de çalıştırın.
            `;
        }

        // Gelen JSON verisini okunabilir bir metne dönüştür
        let schemaText = "VERİTABANI ŞEMASI (Canlı Veri):\n";
        data.forEach((table: any, index: number) => {
            schemaText += `${index + 1}. ${table.table_name} (${table.columns ? table.columns.join(', ') : ''})\n`;
        });

        return schemaText;

    } catch (e) {
        return "Şema bilgisi alınamadı.";
    }
}

// ... POST handler starts here ...
export async function POST(req: Request) {
    try {
        const { message, history } = await req.json();
        // ... (API Key check remains same) ...

        const schemaDescription = await getDatabaseSchema();

        const systemPrompt = `
    Sen zeki bir ERP Asistanısın. Şu anki tarih: ${new Date().toLocaleString('tr-TR')}
    
    ÇOK ÖNEMLİ:
    Aşağıda sana bu veritabanındaki **GERÇEK ve CANLI** tablo listesini veriyorum.
    Sorgu oluştururken SADECE VE SADECE bu listedeki tablo isimlerini kullanabilirsin.
    Asla kafandan "customers", "users" gibi tablo isimleri uydurma. Listede ne yazıyorsa (örn: "customer", "musteri", "cari") HARFİ HARFİNE onu kullan.

            ${schemaDescription}

    GÖREVİN:
    1. Kullanıcının sorusunu analiz et (Örn: "Müşterileri listele").
    2. Yukarıdaki şemayı tara ve anlam olarak "müşteri" ile eşleşebilecek tabloyu bul (Örn: 'customer' tablosu varsa onu kullan).
    3. Tablonun içindeki kolonlara bak ve istenen verilere en yakın kolonları seç.
    4. SQL sorgusu yerine aşağıdaki JSON formatını üret.

    JSON FORMATI:
        {
            "type": "query", // veya sadec sayı soruluyorsa "count"
            "table": "TABLO_ADI_BURAYA_(Listeden_Aynen_Al)",
            "select": "KOLONLAR_(Listeden_Aynen_Al)"
            // "limit": 20  <-- Kullanıcı "hepsi" derse bu satırı sil. Varsayılan 20.
        }
    
    ÖZEL DURUMLAR VE KURALLAR:
    - **SAYI SORULARI ("Kaç tane?", "Toplam sayı ne?"):**
      - JSON'daki "type" değerini "count" yap.
      - Örn: { "type": "count", "table": "products" }
      - Bu, veriyi çekmeden sadece veritabanındaki kayıt sayısını hızlıca getirir (Optimize işlem).
    
    - **VERİ İSTEKLERİ:**
      - JSON'daki "type" değeri "query" olsun.
      - SADECE basit filtreleme (where) ve sıralama (order by) yapabilirsin.
      - ASLA 'SUM', 'AVG' gibi SQL fonksiyonları select içine yazma.
      - "En çok satılan" sorulursa: İlgili tabloyu satış adedine göre AZALAN (desc) sırala.
      - Tablo adını listeden tam eşleştir (Büyük/küçük harf duyarlı).

    Eğer şemada uygun bir tablo bulamazsan:
     Kullanıcıya "Mevcut tablolar arasında bu isteği karşılayacak bir tablo bulamadım." de.
    `;

        // Mesaj geçmişini doğru sırayla oluştur
        const messages = [
            { role: "system", content: systemPrompt },
            ...history.map((msg: any) => ({
                role: msg.role === 'bot' ? 'assistant' : 'user',
                content: msg.content
            })),
            { role: "user", content: message }
        ];

        // Groq API İsteği
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

        // JSON Analiz
        try {
            const jsonMatch = rawContent.match(/\{[\s\S]*\}/);

            if (jsonMatch) {
                const jsonContent = jsonMatch[0];
                const action = JSON.parse(jsonContent);

                // --- 1. COUNT İŞLEMİ (Optimize Sayım) ---
                if (action.type === 'count') {
                    console.log(`Sayım yapılıyor: Tablo=${action.table}`);
                    // head: true -> Veriyi çekmez, sadece sayısını döner (count)
                    const { count, error } = await supabase
                        .from(action.table)
                        .select('*', { count: 'exact', head: true });

                    if (error) {
                        finalResponse = `Sayım hatası: ${error.message}`;
                    } else {
                        finalResponse = `Veritabanında **${action.table}** tablosunda toplam **${count}** kayıt bulundu.`;
                    }
                }
                // --- 2. QUERY İŞLEMİ (Veri Çekme) ---
                else if (action.type === 'query') {
                    let query = supabase.from(action.table).select(action.select || '*');

                    if (action.filters && Array.isArray(action.filters)) {
                        action.filters.forEach((f: any) => {
                            if (f.operator === 'eq') query = query.eq(f.column, f.value);
                            if (f.operator === 'lt') query = query.lt(f.column, f.value);
                            if (f.operator === 'gt') query = query.gt(f.column, f.value);
                            if (f.operator === 'ilike') query = query.ilike(f.column, `%${f.value}%`);
                        });
                    }

                    if (action.limit) query = query.limit(action.limit);
                    if (action.order) query = query.order(action.order, { ascending: action.ascending ?? false });

                    console.log(`Sorgu çalıştırılıyor: Tablo=${action.table}, Select=${action.select}`);
                    const { data, error } = await query;

                    if (error) {
                        finalResponse = `Veritabanı hatası: ${error.message}`;
                    } else if (!data || data.length === 0) {
                        finalResponse = `Aradığınız kriterlere uygun veri bulunamadı.`;
                    } else {
                        // Veri Context'i oluştur
                        const rowCount = data.length;
                        const dataContext = `
                        SORGULANAN VERİ ÖZETİ:
                        - Toplam Satır Sayısı: ${rowCount}
                        - Veriler (JSON): ${JSON.stringify(data)}
                        
                        GÖREV:
                        Bu veriyi kullanarak kullanıcının sorusunu yanıtla.
                        Eğer kullanıcı liste istiyorsa maddeler halinde yaz.
                        Eğer "kaç tane" diye sormuşsa YUKARIDAKİ 'Toplam Satır Sayısı'nı baz al (${rowCount} adet). ASLA KAFANDAN SAYI UYDURMA.
                        `;

                        // Özetleme isteği
                        const summaryRes = await fetch(GROQ_API_URL, {
                            method: "POST",
                            headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
                            body: JSON.stringify({
                                model: "llama-3.3-70b-versatile",
                                messages: [
                                    { role: "system", content: "Sen yardımsever bir asistansın. Verilen kesin veriye sadık kal." },
                                    { role: "user", content: `${dataContext}\n\nKullanıcı Sorusu: ${message}` }
                                ]
                            })
                        });
                        const summaryData = await summaryRes.json();
                        finalResponse = summaryData.choices[0]?.message?.content || "Cevap üretilemedi.";
                    }
                } else {
                    // JSON ama query/count değil
                    if (action.message) finalResponse = action.message;
                    else if (action.content) finalResponse = action.content;
                }
            }

        } catch (e) {
            // JSON değilse text olarak kalır
        }

        return NextResponse.json({ role: "bot", content: finalResponse });

    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json({ role: "bot", content: "Bir hata oluştu: " + error.message });
    }
}
