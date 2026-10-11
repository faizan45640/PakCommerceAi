-- Soft-archive for Rafiq chats. Delete stays a hard remove.

alter table public.copilot_chats
  add column archived_at timestamptz;

comment on column public.copilot_chats.archived_at is
  'When set, the chat is hidden from Recent. Null means active.';

create index copilot_chats_workspace_active_updated_idx
  on public.copilot_chats (workspace_id, updated_at desc)
  where archived_at is null;

create index copilot_chats_workspace_archived_updated_idx
  on public.copilot_chats (workspace_id, updated_at desc)
  where archived_at is not null;
