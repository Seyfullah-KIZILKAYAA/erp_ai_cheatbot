-- Veritabanında "Customer" (Büyük Harfli) veya "customer" (küçük harfli) tablosu olup olmadığını kontrol edip
-- her senaryo için okuma iznini (RLS Policy) açan kesin çözüm kodu.

-- 1. "Customer" (Baş harfi büyük) tablosu için izinler
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Customer') THEN
        -- RLS'yi aç
        ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
        -- Varsa eski politikayı sil
        DROP POLICY IF EXISTS "AI Access Policy" ON "Customer";
        -- Yeni okuma izni ver
        CREATE POLICY "AI Access Policy" ON "Customer" FOR SELECT USING (true);
    END IF;
END $$;

-- 2. "customer" (Tamamı küçük harf) tablosu için izinler
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'customer') THEN
        ALTER TABLE "customer" ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "AI Access Policy" ON "customer";
        CREATE POLICY "AI Access Policy" ON "customer" FOR SELECT USING (true);
    END IF;
END $$;

-- 3. "Products" veya "products" için de aynısını yapalım (Garanti olsun)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'Products') THEN
        ALTER TABLE "Products" ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "AI Access Policy" ON "Products";
        CREATE POLICY "AI Access Policy" ON "Products" FOR SELECT USING (true);
    END IF;
END $$;
