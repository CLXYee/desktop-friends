-- Chat for Desktop Friends: one chat per group and direct messages between friends.
--
-- The Spring Boot backend is the only client of these tables: it connects as the database owner and checks
-- every rule itself (membership, friendship, rate limit, who may edit what). They are not exposed through
-- Supabase's API: row-level security is on with no policies, and anon/authenticated get no privileges.
-- Apply after 20261015000000_friends_presence_groups.sql. Safe to run again.

-- ---------------------------------------------------------------------------------------------------
-- Characters: the companion someone picked in the app is their avatar; a group picks one as its theme.
-- ---------------------------------------------------------------------------------------------------

alter table public.profiles
  add column if not exists character_id text not null default 'crystal' check (character_id ~ '^[a-z0-9_-]{1,32}$');

comment on column public.profiles.character_id is 'The companion character the user picked in the app; shown as their avatar.';

alter table public.groups
  add column if not exists description text not null default '' check (char_length(description) <= 200),
  add column if not exists character_id text not null default 'crystal' check (character_id ~ '^[a-z0-9_-]{1,32}$');

comment on column public.groups.description is 'What the group is about (up to 200 characters).';
comment on column public.groups.character_id is 'The companion character the group uses as its avatar and colour theme.';

-- ---------------------------------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------------------------------

-- A group's chat (group_id) or a direct chat between two people (direct_user_a/b).
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  group_id uuid unique references public.groups (id) on delete cascade,
  direct_user_a uuid references public.profiles (id) on delete cascade,
  direct_user_b uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Sorts the chat list.
  last_message_at timestamptz,
  constraint conversations_kind_shape check (
    (kind = 'group' and group_id is not null and direct_user_a is null and direct_user_b is null)
    or (kind = 'direct' and group_id is null and direct_user_a is not null and direct_user_b is not null
        and direct_user_a <> direct_user_b)
  )
);

comment on table public.conversations is 'Chats: exactly one per group, and at most one per pair of people.';

-- At most one direct chat per pair, whoever opened it (the same trick as friendships).
create unique index if not exists conversations_direct_pair_key
  on public.conversations (least(direct_user_a, direct_user_b), greatest(direct_user_a, direct_user_b))
  where kind = 'direct';

-- Who is in which chat. Also the access rule (only members read or write) and the unread counter.
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Messages after this are unread.
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

-- ---------------------------------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------------------------------

create table if not exists public.messages (
  -- Ordered: pages are "id < cursor order by id desc".
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  -- Emptied when the message is deleted (the row stays so replies and order still make sense).
  body text not null,
  kind text not null default 'text' check (kind in ('text', 'system')),
  reply_to_id bigint references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint messages_body_length check (
    (deleted_at is null and char_length(body) between 1 and 2000) or (deleted_at is not null and body = '')
  )
);

comment on table public.messages is 'Chat messages. Deleting one empties its body and sets deleted_at (soft delete).';

-- Loading a chat, 50 at a time, newest first.
create index if not exists messages_conversation_id_idx on public.messages (conversation_id, id desc);
-- The rate limit: how many messages someone sent lately.
create index if not exists messages_sender_recent_idx on public.messages (sender_id, created_at desc);

create table if not exists public.message_reactions (
  message_id bigint not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- ---------------------------------------------------------------------------------------------------
-- Group chats follow their groups: created with the group, members join and leave with it, and deleted
-- with it (the foreign key above). Done in the database so it holds however a group changes.
-- ---------------------------------------------------------------------------------------------------

create or replace function public.create_group_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversations (kind, group_id, created_at)
  values ('group', new.id, new.created_at)
  on conflict (group_id) do nothing;
  return new;
end;
$$;

drop trigger if exists groups_create_conversation on public.groups;
create trigger groups_create_conversation
  after insert on public.groups
  for each row execute function public.create_group_conversation();

create or replace function public.sync_group_conversation_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Joining starts with everything already said counted as read.
    insert into public.conversation_members (conversation_id, user_id)
    select conversation.id, new.user_id from public.conversations conversation where conversation.group_id = new.group_id
    on conflict (conversation_id, user_id) do nothing;
    return new;
  end if;
  delete from public.conversation_members member
  using public.conversations conversation
  where conversation.id = member.conversation_id and conversation.group_id = old.group_id and member.user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists group_members_sync_conversation on public.group_members;
create trigger group_members_sync_conversation
  after insert or delete on public.group_members
  for each row execute function public.sync_group_conversation_member();

-- Groups that existed before chat get their conversation and members now.
insert into public.conversations (kind, group_id, created_at)
select 'group', g.id, g.created_at from public.groups g
on conflict (group_id) do nothing;

insert into public.conversation_members (conversation_id, user_id)
select conversation.id, member.user_id
from public.group_members member
join public.conversations conversation on conversation.group_id = member.group_id
on conflict (conversation_id, user_id) do nothing;

-- ---------------------------------------------------------------------------------------------------
-- Not reachable through Supabase's API: only the backend (the table owner) uses these tables.
-- ---------------------------------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;

revoke all on public.conversations, public.conversation_members, public.messages, public.message_reactions
  from anon, authenticated;
revoke all on sequence public.messages_id_seq from anon, authenticated;
revoke execute on function public.create_group_conversation(), public.sync_group_conversation_member()
  from public, anon, authenticated;
