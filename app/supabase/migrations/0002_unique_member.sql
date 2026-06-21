-- Cada miembro de Notion sólo puede estar ligado a UNA cuenta.
create unique index if not exists profiles_notion_user_unique
  on public.profiles (notion_user_id)
  where notion_user_id is not null;
