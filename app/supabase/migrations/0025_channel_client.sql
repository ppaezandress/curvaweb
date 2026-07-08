-- Agrupar canales por cliente: cada canal puede apuntar a un cliente de Notion
-- (se guarda el id de Notion como texto). La UI agrupa el sidebar por cliente.
-- Lo asigna creador/admin desde Ajustes del canal (ya cubierto por channels_update, 0020).
alter table public.channels add column if not exists client_id text;
