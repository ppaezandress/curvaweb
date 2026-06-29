-- Seguridad: un usuario autenticado NO puede modificar su propio rol/identidad desde el
-- cliente (browser usa la anon key). Solo el servidor (service role, en /api/auth/register)
-- puede setear estos campos. Cierra la escalada de privilegios: un miembro poniéndose
-- is_admin=true, o cambiando su notion_user_id/email para suplantar a otra persona.
-- (La policy profiles_update_self sigue permitiendo cambiar name/avatar_url de tu propia fila.)
revoke update (is_admin, notion_user_id, email) on public.profiles from authenticated;
revoke update (is_admin, notion_user_id, email) on public.profiles from anon;
