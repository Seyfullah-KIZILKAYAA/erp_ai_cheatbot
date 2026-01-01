-- DİKKAT: Veritabanında elle oluşturduğunuz tablonun adını aşağıda düzeltin
-- Örneğin tablo adınız 'musteriler' ise 'customers' yazan yerleri 'musteriler' yapın.

-- 1. Tablo güvenliğini aktif et
alter table customers enable row level security;

-- 2. Herkese okuma izni ver (Chatbot'un veriyi görebilmesi için ŞART)
create policy "Chatbot okuma izni" 
on customers for select using (true);
