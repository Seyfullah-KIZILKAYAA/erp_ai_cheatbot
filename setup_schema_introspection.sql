-- Bu fonksiyon, veritabanındaki tüm tabloları ve sütunlarını getirir.
-- AI Chatbot bu fonksiyonu çağırarak veritabanı yapısını öğrenir.

create or replace function get_schema_info()
returns json
language plpgsql
security definer -- Bu, fonksiyonun admin yetkisiyle çalışmasını sağlar (tabloları görebilmek için)
as $$
begin
  return (
    select json_agg(t)
    from (
      select
        table_name,
        (
          select json_agg(column_name)
          from information_schema.columns c
          where c.table_schema = 'public'
          and c.table_name = tables.table_name
        ) as columns
      from information_schema.tables tables
      where table_schema = 'public'
      and table_type = 'BASE TABLE'
    ) t
  );
end;
$$;
