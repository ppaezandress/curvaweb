-- Seguridad: un usuario autenticado (browser, anon key) NO puede modificar su propio rol ni
-- identidad. Solo el servidor (service role, en /api/auth/register) puede setear is_admin /
-- notion_user_id / email. Cierra la escalada de privilegios (un miembro poniéndose admin) y
-- la suplantación (cambiar tu notion_user_id para ver la data de otro).
--
-- OJO: un `revoke update (columna)` NO basta si existe un GRANT UPDATE a nivel de tabla
-- (Postgres lo ignora). La forma correcta: revocar el update de tabla por completo y conceder
-- SOLO la columna que el cliente sí necesita (avatar_url, la foto de perfil).
revoke update on public.profiles from authenticated;
revoke update on public.profiles from anon;
grant update (avatar_url) on public.profiles to authenticated;
