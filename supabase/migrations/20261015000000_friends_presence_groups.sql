-- Friends, online status and groups for Desktop Friends.
--
-- Every write goes through the security-definer functions below, so the rules (who may befriend or
-- invite whom) live in one place; signed-in users can only read tables directly, and row-level security
-- limits that to rows they are part of. Apply after 20261013000000_profiles.sql.

-- ---------------------------------------------------------------------------------------------------
-- Online status
-- ---------------------------------------------------------------------------------------------------

-- 'online' while the app runs, 'idle' after a while without keyboard or mouse input, 'offline' after
-- logging out or quitting. The app re-reports its status every minute (last_seen_at), so a status
-- left behind by a crash counts as offline once it goes stale (see public.presence).
alter table public.profiles
  add column if not exists status text not null default 'offline' check (status in ('online', 'idle', 'offline')),
  add column if not exists last_seen_at timestamptz;

comment on column public.profiles.status is 'Last status the app reported: online, idle or offline.';
comment on column public.profiles.last_seen_at is 'When the app last reported the status (a heartbeat).';

-- The status people see: what was reported, unless the app stopped reporting it (e.g. it crashed).
-- PostgREST exposes this as a computed column: select=id,presence.
create or replace function public.presence(profile public.profiles)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when profile.status <> 'offline' and profile.last_seen_at > now() - interval '3 minutes' then profile.status
    else 'offline'
  end;
$$;

create or replace function public.set_my_status(new_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'You need to be logged in.';
  end if;
  if new_status is null or new_status not in ('online', 'idle', 'offline') then
    raise exception 'Unknown status "%".', new_status;
  end if;
  update public.profiles set status = new_status, last_seen_at = now() where id = (select auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Friends
-- ---------------------------------------------------------------------------------------------------

-- One row per pair of people: a pending request (requester asked addressee) or an accepted friendship.
-- Declining a request, cancelling it or unfriending deletes the row.
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (requester_id <> addressee_id)
);

comment on table public.friendships is 'Friend requests (pending) and friendships (accepted) between two profiles.';

-- At most one row per pair, whoever asked first.
create unique index if not exists friendships_pair_key
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_idx on public.friendships (addressee_id);

-- ---------------------------------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------------------------------

-- 12 random hex characters (48 bits) for invite links.
create or replace function public.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
$$;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40 and name = btrim(name)),
  -- Anyone holding this code (shared as an invite link) can join; the owner can replace it.
  invite_code text not null unique default public.new_invite_code(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.groups is 'Groups of friends. Members are in group_members.';

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

comment on table public.group_members is 'Who belongs to which group; each group has one owner.';

create index if not exists group_members_user_idx on public.group_members (user_id);

-- Invitations a member sent to one of their friends. Accepting or declining deletes the row.
create table if not exists public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, invitee_id)
);

comment on table public.group_invitations is 'Pending invitations to join a group, sent to a friend.';

create index if not exists group_invitations_invitee_idx on public.group_invitations (invitee_id);

-- ---------------------------------------------------------------------------------------------------
-- Visibility helpers (security definer, so policies can use them without recursing into each other)
-- ---------------------------------------------------------------------------------------------------

create or replace function public.is_group_member(target_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members where group_id = target_group and user_id = (select auth.uid())
  );
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and least(requester_id, addressee_id) = least(a, b)
      and greatest(requester_id, addressee_id) = greatest(a, b)
  );
$$;

-- Whether the signed-in user may see someone's profile (name and status): their own, their friends,
-- anyone waiting for them to accept a friend request, fellow group members, and whoever invited them to a
-- group. Sending a request does not reveal the other person's status (see sent_friend_requests).
create or replace function public.can_see_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target = (select auth.uid())
    or exists (
      select 1 from public.friendships
      where (addressee_id = (select auth.uid()) and requester_id = target)
         or (requester_id = (select auth.uid()) and addressee_id = target and status = 'accepted')
    )
    or exists (
      select 1 from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = target
    )
    or exists (
      select 1 from public.group_invitations where invitee_id = (select auth.uid()) and inviter_id = target
    );
$$;

-- ---------------------------------------------------------------------------------------------------
-- Row-level security: read-only access to the rows you are part of
-- ---------------------------------------------------------------------------------------------------

drop policy if exists "Profiles are readable by their owner and admins" on public.profiles;
drop policy if exists "Profiles are readable by their owner, connections and admins" on public.profiles;
create policy "Profiles are readable by their owner, connections and admins"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or public.can_see_profile(id) or (select public.is_admin()));

alter table public.friendships enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invitations enable row level security;

drop policy if exists "Friendships are readable by both people" on public.friendships;
create policy "Friendships are readable by both people"
  on public.friendships for select
  to authenticated
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists "Groups are readable by members and invitees" on public.groups;
create policy "Groups are readable by members and invitees"
  on public.groups for select
  to authenticated
  using (
    public.is_group_member(id)
    or exists (
      select 1 from public.group_invitations
      where group_invitations.group_id = groups.id and group_invitations.invitee_id = (select auth.uid())
    )
  );

drop policy if exists "Group members are readable by fellow members" on public.group_members;
create policy "Group members are readable by fellow members"
  on public.group_members for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "Group invitations are readable by the invitee and members" on public.group_invitations;
create policy "Group invitations are readable by the invitee and members"
  on public.group_invitations for select
  to authenticated
  using (invitee_id = (select auth.uid()) or public.is_group_member(group_id));

revoke all on public.friendships, public.groups, public.group_members, public.group_invitations from anon, authenticated;
grant select on public.friendships, public.groups, public.group_members, public.group_invitations to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Friend actions
-- ---------------------------------------------------------------------------------------------------

-- Sends a friend request by username. If that person already asked you, this accepts it instead.
-- Returns the friendship's status afterwards: 'pending' or 'accepted'.
create or replace function public.send_friend_request(friend_username text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid;
  existing public.friendships;
begin
  if me is null then
    raise exception 'You need to be logged in.';
  end if;
  select id into target from public.profiles where username = lower(btrim(coalesce(friend_username, '')));
  if target is null then
    raise exception 'No one has the username "%".', lower(btrim(coalesce(friend_username, '')));
  end if;
  if target = me then
    raise exception 'That''s you! Add someone else.';
  end if;

  select * into existing from public.friendships
  where least(requester_id, addressee_id) = least(me, target)
    and greatest(requester_id, addressee_id) = greatest(me, target)
  for update;

  if found then
    if existing.status = 'accepted' then
      raise exception 'You are already friends.';
    elsif existing.requester_id = me then
      raise exception 'You already sent them a request.';
    end if;
    update public.friendships set status = 'accepted', accepted_at = now() where id = existing.id;
    return 'accepted';
  end if;

  insert into public.friendships (requester_id, addressee_id) values (me, target)
  on conflict do nothing;
  if not found then
    raise exception 'A request between you two was just sent. Refresh and try again.';
  end if;
  return 'pending';
end;
$$;

-- Accepts or declines a request someone sent you.
create or replace function public.respond_friend_request(request_id uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'You need to be logged in.';
  end if;
  if accept then
    update public.friendships set status = 'accepted', accepted_at = now()
    where id = request_id and addressee_id = me and status = 'pending';
  else
    delete from public.friendships where id = request_id and addressee_id = me and status = 'pending';
  end if;
  if not found then
    raise exception 'That friend request is no longer waiting for you.';
  end if;
end;
$$;

-- The requests you sent that are still waiting: who they went to, without their status.
create or replace function public.sent_friend_requests()
returns table (id uuid, addressee_id uuid, username text, display_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.addressee_id, p.username, p.display_name, f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.addressee_id
  where f.requester_id = (select auth.uid()) and f.status = 'pending'
  order by f.created_at desc;
$$;

-- Unfriends someone, or cancels the request you sent them.
create or replace function public.remove_friend(friend_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'You need to be logged in.';
  end if;
  delete from public.friendships
  where least(requester_id, addressee_id) = least(me, friend_id)
    and greatest(requester_id, addressee_id) = greatest(me, friend_id)
    and (status = 'accepted' or requester_id = me);
  if not found then
    raise exception 'You are not friends with them.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------
-- Group actions
-- ---------------------------------------------------------------------------------------------------

-- Creates a group with you as its owner and returns its id.
create or replace function public.create_group(group_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  clean_name text := btrim(coalesce(group_name, ''));
  new_group uuid;
begin
  if me is null then
    raise exception 'You need to be logged in.';
  end if;
  if char_length(clean_name) not between 1 and 40 then
    raise exception 'Group names are 1–40 characters.';
  end if;
  insert into public.groups (name, created_by) values (clean_name, me) returning id into new_group;
  insert into public.group_members (group_id, user_id, role) values (new_group, me, 'owner');
  return new_group;
end;
$$;

-- Invites one of your friends to a group you belong to.
create or replace function public.invite_to_group(target_group uuid, friend_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'You need to be logged in.';
  end if;
  if not exists (select 1 from public.group_members where group_id = target_group and user_id = me) then
    raise exception 'Only members can invite people to this group.';
  end if;
  if not public.are_friends(me, friend_id) then
    raise exception 'You can only invite your friends.';
  end if;
  if exists (select 1 from public.group_members where group_id = target_group and user_id = friend_id) then
    raise exception 'They are already in this group.';
  end if;
  insert into public.group_invitations (group_id, inviter_id, invitee_id) values (target_group, me, friend_id)
  on conflict (group_id, invitee_id) do nothing;
  if not found then
    raise exception 'They already have an invitation to this group.';
  end if;
end;
$$;

-- Accepts (joins the group) or declines an invitation sent to you. Returns the group's id.
create or replace function public.respond_group_invitation(invitation_id uuid, accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  invited_group uuid;
begin
  if me is null then
    raise exception 'You need to be logged in.';
  end if;
  delete from public.group_invitations where id = invitation_id and invitee_id = me
  returning group_id into invited_group;
  if invited_group is null then
    raise exception 'That invitation is no longer available.';
  end if;
  if accept then
    insert into public.group_members (group_id, user_id) values (invited_group, me)
    on conflict do nothing;
  end if;
  return invited_group;
end;
$$;

-- Joins the group an invite link (its code) points to. Returns the group's id.
create or replace function public.join_group_by_code(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  found_group uuid;
begin
  if me is null then
    raise exception 'You need to be logged in.';
  end if;
  select id into found_group from public.groups where invite_code = lower(btrim(coalesce(code, '')));
  if found_group is null then
    raise exception 'That invite link doesn''t work. It may have been reset; ask for a new one.';
  end if;
  insert into public.group_members (group_id, user_id) values (found_group, me) on conflict do nothing;
  delete from public.group_invitations where group_id = found_group and invitee_id = me;
  return found_group;
end;
$$;

-- Leaves a group. An owner who leaves hands the group to the longest-standing member; the last
-- member to leave deletes it.
create or replace function public.leave_group(target_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  my_role text;
  successor uuid;
begin
  if me is null then
    raise exception 'You need to be logged in.';
  end if;
  delete from public.group_members where group_id = target_group and user_id = me returning role into my_role;
  if my_role is null then
    raise exception 'You are not in this group.';
  end if;
  select user_id into successor from public.group_members
  where group_id = target_group order by joined_at, user_id limit 1;
  if successor is null then
    delete from public.groups where id = target_group;
  elsif my_role = 'owner' then
    update public.group_members set role = 'owner' where group_id = target_group and user_id = successor;
  end if;
end;
$$;

-- Replaces a group's invite code, so links shared earlier stop working. Owner only; returns the new code.
create or replace function public.reset_group_invite_code(target_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  new_code text;
begin
  if me is null then
    raise exception 'You need to be logged in.';
  end if;
  if not exists (select 1 from public.group_members where group_id = target_group and user_id = me and role = 'owner') then
    raise exception 'Only the group''s owner can reset its invite link.';
  end if;
  update public.groups set invite_code = public.new_invite_code() where id = target_group returning invite_code into new_code;
  return new_code;
end;
$$;

-- Only signed-in users may call the actions (Supabase grants new functions to anon by default).
revoke execute on function
  public.set_my_status(text),
  public.send_friend_request(text),
  public.respond_friend_request(uuid, boolean),
  public.sent_friend_requests(),
  public.remove_friend(uuid),
  public.create_group(text),
  public.invite_to_group(uuid, uuid),
  public.respond_group_invitation(uuid, boolean),
  public.join_group_by_code(text),
  public.leave_group(uuid),
  public.reset_group_invite_code(uuid),
  public.is_group_member(uuid),
  public.are_friends(uuid, uuid),
  public.can_see_profile(uuid),
  public.new_invite_code()
from public, anon;
grant execute on function
  public.set_my_status(text),
  public.send_friend_request(text),
  public.respond_friend_request(uuid, boolean),
  public.sent_friend_requests(),
  public.remove_friend(uuid),
  public.create_group(text),
  public.invite_to_group(uuid, uuid),
  public.respond_group_invitation(uuid, boolean),
  public.join_group_by_code(text),
  public.leave_group(uuid),
  public.reset_group_invite_code(uuid),
  public.is_group_member(uuid),
  public.are_friends(uuid, uuid),
  public.can_see_profile(uuid)
to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Realtime: the app listens for changes to these tables so statuses, requests and groups update live.
-- Supabase checks the select policies above before delivering a change to someone.
-- ---------------------------------------------------------------------------------------------------

do $$
declare
  table_name text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach table_name in array array['profiles', 'friendships', 'groups', 'group_members', 'group_invitations'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;
