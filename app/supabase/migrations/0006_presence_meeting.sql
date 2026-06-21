-- Estado "en junta" (de Google Calendar freebusy; solo ocupado/libre, sin títulos)
alter table public.presence add column if not exists in_meeting boolean default false;
