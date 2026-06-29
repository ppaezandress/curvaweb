-- Rol de admin. Solo los admins (Andrés + Balmori) ven la data de TODAS las personas
-- y el dashboard del equipo. Los demás ven SU propia data + la capa social (fotos,
-- música, kudos, rachas). Es el muro individuo/equipo.
alter table public.profiles add column if not exists is_admin boolean default false;

update public.profiles set is_admin = true
  where lower(email) in ('ppaezandress@gmail.com', 'osbalmar2004@gmail.com');
