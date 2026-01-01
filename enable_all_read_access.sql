-- BU KOMUT TÜM TABLOLAR İÇİN OKUMA İZNİNİ AÇAR (ÇOK ÖNEMLİ)
-- Tek tek tablo adı yazmak yerine, veritabanındaki her tabloyu bulup erişime açar.

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        -- 1. RLS'yi Aktif Et
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tablename);
        
        -- 2. Eski politikaları temizle (varsa)
        EXECUTE format('DROP POLICY IF EXISTS "Genel Okuma İzni" ON %I', r.tablename);
        
        -- 3. Yeni, herkese açık okuma izni ver
        EXECUTE format('CREATE POLICY "Genel Okuma İzni" ON %I FOR SELECT USING (true)', r.tablename);
        
        RAISE NOTICE 'Tablo erişime açıldı: %', r.tablename;
    END LOOP;
END $$;
