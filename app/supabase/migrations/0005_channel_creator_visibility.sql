-- Fix: al crear un canal, el INSERT ... RETURNING lo bloqueaba RLS porque el
-- creador todavía no figura en channel_members. El creador debe ver su canal.

create or replace function public.can_see_channel(cid bigint)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid and (c.kind = 'team' or c.created_by = auth.uid())
  ) or exists (
    select 1 from public.channel_members m where m.channel_id = cid and m.user_id = auth.uid()
  );
$$;

drop policy if exists "channels_read" on public.channels;
create policy "channels_read" on public.channels for select to authenticated
  using (kind = 'team' or created_by = auth.uid() or public.can_see_channel(id));
