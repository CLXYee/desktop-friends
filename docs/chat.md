# Chat: group chats and direct messages

This document describes the chat feature of Desktop Friends: one chat per group, and private chats between
friends. It covers the database tables (now live in the hosted Supabase project), the Spring Boot backend that
holds the rules, the app's chat screens, and how it was tested with three accounts.

> **Update:** the app's layout has since changed. Groups and group chats are one thing, shown on a single
> **Chats** page like a normal chat app. See [chats-page.md](chats-page.md) for that change and its test cases.
> Sections 1 and 5 below describe the current layout.

![A group chat: notes from the app, character avatars, names and times](chat/group-chat-amy.png)

## Contents

1. [What you can do](#1-what-you-can-do)
2. [Architecture](#2-architecture)
3. [Database](#3-database)
4. [Backend](#4-backend)
5. [The app](#5-the-app)
6. [Testing](#6-testing)
7. [How the original design was mapped](#7-how-the-original-design-was-mapped)
8. [Running it and applying the migration](#8-running-it-and-applying-the-migration)
9. [Limits and next steps](#9-limits-and-next-steps)
10. [Files added and changed](#10-files-added-and-changed)

---

## 1. What you can do

**Group chats**

- Every group has exactly one chat, created with the group. Joining the group (by invitation or invite link)
  puts you in its chat; leaving takes you out. When the last member leaves, the group and its chat are deleted.
- Group chats are listed on the **Chats** page together with your direct chats. A group's members, invite
  link and leaving are in its chat's **ⓘ Group info** panel.
- The app writes notes into the chat: "Amy created the group.", "Ben joined the group.", "Cleo left the group.",
  "Ben is now the owner.", and "Amy renamed the group to …".
- Groups have a **description** and a **character** (one of the five companions) as their avatar and colour.
  You set them when creating a group; the owner can change them with **Edit details**.

**Direct messages**

- Click **💬 Chat** next to a friend (Friends page), or **＋ New chat** on the Chats page, to open your private
  chat with them. There is only ever one
  chat per pair of friends, whoever opens it.
- Chats with a record (at least one message) are listed on the Chats page; a friend you've never chatted with
  isn't listed until the first message.
- Only friends can message each other. If a friendship ends, the chat history stays readable, but nobody can
  send until you are friends again; then the same chat carries on.

**In every chat**

- Each message shows the sender's **avatar** (the companion character they picked in the app), their
  **name** and the **time** it was sent. Several messages in a row from the same person share one avatar and
  name, and every later message shows its time in small grey text right after its text (not under the avatar).
- When a message is the first of a new day, the **date** is shown above it ("Today · Monday, 19 October 2026",
  "Yesterday · …", or just the date for older days). Other messages don't repeat it.
- Live: new messages, edits, reactions and deletions appear for everyone in the chat straight away, and
  "Ben is typing…" shows while someone writes.
- Reply to a message (it's quoted above yours; click the quote to jump to it), react with 👍 ❤️ 😂 😮 😢 🎉,
  edit or delete your own messages (a deleted message leaves a "Message deleted" placeholder).
- Unread counts show in the chat list and on **Chats** in the sidebar, and clear when you open the chat.
  **Mute** stops a chat counting unread.
- Older messages load 50 at a time as you scroll up.
- Enter sends, Shift+Enter starts a new line; messages are 1–2000 characters. Sending more than 10 messages
  within 10 seconds is refused with "You're sending messages too fast".

| Direct chat: dates, replies and reactions | The Chats page |
|---|---|
| ![Direct chat with date separators, a reply and a reaction](chat/typing.png) | ![Chats page](chat/chats-page.png) |

| Group info: members, invite, invite link, leave | Friends: the 💬 Chat button |
|---|---|
| ![Group info panel](chat/group-info.png) | ![Friends list with Chat buttons](chat/friend-list-chat-button.png) |

---

## 2. Architecture

Chat uses the same architecture as the rest of the backend: a **layered (n-tier) Spring Boot REST API** with
**event-driven live updates over Server-Sent Events (SSE)**. The database is the hosted Supabase Postgres;
the app never talks to Supabase directly.

```
 Desktop app (React)                         Spring Boot backend                              Supabase Postgres
┌──────────────────────┐   REST (JSON)   ┌──────────────────────────────────────────┐   JDBC   ┌──────────────────────┐
│ ChatsPage / ChatView │ ───────────────▶│ Controller   ConversationController,      │          │ conversations        │
│ ChatProvider (state) │                 │              MessageController            │          │ conversation_members │
│ services/chat.ts     │                 │     │                                     │          │ messages             │
│                      │                 │ Service      ConversationService,          │          │ message_reactions    │
│                      │                 │              MessageService (the rules)    │─────────▶│ + triggers keeping   │
│                      │                 │     │                                     │          │   group chats in step│
│                      │                 │ Repository   Spring Data JPA               │          └──────────────────────┘
│                      │                 │     │                                     │
│                      │   SSE stream    │ Event        SocialEvent ─▶ (after commit)│
│ liveEvents.ts        │ ◀───────────────│              SocialEventListener ─▶       │
│ (one shared stream)  │  /api/events    │              EventStreamService (SSE)     │
└──────────────────────┘                 └──────────────────────────────────────────┘
        (all requests go through nginx at /api)
```

**Layers and their jobs**

| Layer | Classes | Job |
|---|---|---|
| Controller | `ConversationController`, `MessageController` | HTTP only: read the request, call one service method, return a DTO |
| Service | `ConversationService`, `MessageService` | The rules: membership, friendship, rate limit, ownership, read state; one transaction per action |
| Mapper | `MessageMapper` | Entities → response DTOs, loading senders, quoted replies and reactions for a whole page at once |
| Repository | `ConversationRepository`, `ConversationMemberRepository`, `MessageRepository`, `MessageReactionRepository` | Spring Data JPA queries |
| Entity | `Conversation`, `ConversationMember`, `Message`, `MessageReaction` (+ `ConversationKind`, `MessageKind`) | The tables |
| DTO | `SendMessageRequest`, `MessageResponse`, `ConversationResponse`, `MessagePageResponse`, … | What the API accepts and returns |
| Event | `SocialEvent` + `SocialEventListener` → `EventStreamService` | Live updates to exactly the chat's members, **after** the transaction commits |

**What happens when Amy sends a message**

1. The app calls `POST /api/conversations/{id}/messages` with Amy's access token (through nginx).
2. `MessageController.sendMessage` hands it to `MessageService.sendMessage`, which, in one transaction:
   - checks Amy is a member of the chat (otherwise "That chat isn't available");
   - for a direct chat, checks she's still friends with the other person;
   - checks the text (1–2000 characters, trimmed) and the rate limit (10 messages per 10 seconds);
   - checks a quoted message belongs to the same chat;
   - saves the message, updates the chat's `last_message_at`, and marks the chat read for Amy (writing means
     you've seen it);
   - publishes a `message` event addressed to the chat's members.
3. After the transaction commits, `SocialEventListener` pushes the event to the open SSE streams of those
   members (Ben's and Cleo's apps, and Amy's other windows). Nothing is sent if the transaction rolled back.
4. Each app merges the message into the open chat, or bumps that chat's unread count in the chat list.

Why this shape: it is the same as friends, status and groups (one codebase, one way of doing things). The
rules sit in plain, unit-testable Java services. "Push only after commit" means nobody ever sees a message
that wasn't saved.

---

## 3. Database

Migration: [`supabase/migrations/20261019000000_chat.sql`](../supabase/migrations/20261019000000_chat.sql),
**applied to the hosted Supabase project** (`sootefnhyzoxhdgwvtmh`) on 19 October 2026. It can be run again
safely.

### Tables

**`conversations`**: one row per chat.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key |
| `kind` | text | `'direct'` or `'group'` |
| `group_id` | uuid, unique | the group (group chats only); deleting the group deletes its chat |
| `direct_user_a`, `direct_user_b` | uuid | the two people (direct chats only) |
| `created_at` | timestamptz | |
| `last_message_at` | timestamptz | sorts the chat list |

A check constraint makes the shape match the kind (a group chat has a group and no people; a direct chat has
two different people and no group). A unique index on `(least(a, b), greatest(a, b))` makes sure there is
**one direct chat per pair** whichever order they come in, the same trick as `friendships`.

**`conversation_members`**: who is in which chat; primary key `(conversation_id, user_id)`.

| Column | Notes |
|---|---|
| `last_read_at` | messages after this are unread |
| `muted` | a muted chat doesn't count towards unread |
| `joined_at` | |

**`messages`**

| Column | Notes |
|---|---|
| `id` | `bigint generated always as identity`: grows with every message, so it orders a chat and pages it |
| `conversation_id` | |
| `sender_id` | `on delete set null`: messages survive a deleted account |
| `body` | 1–2000 characters; emptied when deleted |
| `kind` | `'text'` or `'system'` (the app's notes) |
| `reply_to_id` | the quoted message (`on delete set null`) |
| `created_at`, `edited_at`, `deleted_at` | soft delete: `deleted_at` set, body emptied, row kept |

Indexes: `(conversation_id, id desc)` for loading a chat page by page; `(sender_id, created_at desc)` for the
rate limit.

**`message_reactions`**: primary key `(message_id, user_id, emoji)`, so one of each emoji per person per
message.

**Group details**: `groups` gained `description` (up to 200 characters) and `character_id`; `profiles` gained
`character_id` (the companion shown as the person's avatar, default `crystal`).

### Kept in step by the database

Two triggers make sure group chats follow their groups, however a group changes:

- `groups_create_conversation`: a new group gets its chat.
- `group_members_sync_conversation`: joining a group adds you to its chat (with everything already said
  counted as read); leaving removes you.

The migration also **backfilled** the groups that already existed. On the hosted project that was 2 groups and
3 members (including `user1`'s group), all now with their chats.

### Security

The backend is the only client of these tables. Row-level security is on with no policies, and the `anon` and
`authenticated` roles have no privileges. Asking Supabase's public API for them returns
`42501 permission denied` (checked).

---

## 4. Backend

### API

All endpoints are under `/api`, need `Authorization: Bearer <access token>`, and answer errors as
`{"status": …, "error": "<message for people>"}`.

| Method | Path | Body | Answer |
|---|---|---|---|
| GET | `/api/conversations` | | your chats, most recent first: title, avatar character, last message, unread count, muted, `canSend` |
| GET | `/api/conversations/{id}` | | one chat |
| POST | `/api/conversations/direct` | `{friendId}` | your chat with that friend (created the first time) |
| GET | `/api/conversations/{id}/messages?before=&limit=` | | up to 50 messages, oldest first, with `hasMore` and `nextCursor` |
| POST | `/api/conversations/{id}/messages` | `{body, replyToId?}` | 201, the message |
| POST | `/api/conversations/{id}/read` | | 204, everything up to now is read |
| PUT | `/api/conversations/{id}/mute` | `{muted}` | 204 |
| POST | `/api/conversations/{id}/typing` | | 204, the others see "… is typing" (not stored) |
| PATCH | `/api/messages/{id}` | `{body}` | the edited message (your own only) |
| DELETE | `/api/messages/{id}` | | 204, soft delete (your own only) |
| PUT | `/api/messages/{id}/reactions` | `{emoji}` | the message with its reactions |
| DELETE | `/api/messages/{id}/reactions?emoji=` | | the message with its reactions |
| PUT | `/api/profiles/me` | `{characterId}` | your profile (sets your avatar) |
| POST | `/api/groups` | `{name, description?, characterId?}` | 201, the group, including its `conversationId` |
| PATCH | `/api/groups/{id}` | `{name?, description?, characterId?}` | the group (owner only) |

Live events on `/api/events` (in addition to `friends`, `groups`, `presence`):

| Event | Sent to | Data |
|---|---|---|
| `message` | the chat's members | the new message |
| `message-updated` | the chat's members | the message after an edit, delete or reaction |
| `typing` | the chat's other members | `{conversationId, user}`; nothing is stored |

### Rules (where they live)

| Rule | Where |
|---|---|
| Only members read or write a chat; to others it "isn't available" (404, so its existence isn't revealed) | `ConversationService.requireMembership` |
| Direct chats only between friends (opening and sending) | `ConversationService.openDirectConversation`, `MessageService.sendMessage` |
| One direct chat per pair, even if both open it at once | unique index + `insert … on conflict do nothing` |
| 1–2000 characters, trimmed | `MessageService.cleanBody` (and a database check) |
| At most 10 messages per 10 seconds per person (429) | `MessageService.sendMessage` |
| Replies only to a message of the same chat | `MessageService.sendMessage` |
| Edit/delete only your own text messages (not the app's notes) | `MessageService.findOwnMessage` |
| Reactions from a fixed set of six | `MessageService.REACTIONS` |
| Group details: owner only; known characters only; description up to 200 | `GroupService.updateGroup` |
| Unread = text messages by others after your `last_read_at`, not deleted | `MessageRepository.countUnreadByConversation` |

---

## 5. The app

- **Chats page** ([`ChatsPage.tsx`](../frontend/src/renderer/features/chat/ChatsPage.tsx),
  [`ChatList.tsx`](../frontend/src/renderer/features/chat/ChatList.tsx)): one list of chats with a record,
  groups and friends together, newest first, with search and group invitations on top; the open chat on the
  right; **＋ New chat** and **＋ New group** in the top-right corner. Details:
  [chats-page.md](chats-page.md).
- **Chat screen** ([`ChatView.tsx`](../frontend/src/renderer/features/chat/ChatView.tsx)): a header (avatar, name, the
  group's description or member names / the friend's status, Mute, ⓘ Group info), the messages, the
  typing line and the box to write in. It keeps you at the bottom as messages arrive, unless you scrolled up
  (then a "New messages ↓" button appears), and keeps your place when older messages load above.
- **Layout rules** ([`shared/chat.ts`](../frontend/src/shared/chat.ts)): `layoutMessages` decides where the date
  goes (first message of each day) and when to show the avatar and name (someone else spoke, more than 5
  minutes passed, or it's a reply). Times use the computer's own format.
- **Avatars** ([`CharacterAvatar.tsx`](../frontend/src/renderer/features/chat/CharacterAvatar.tsx)): the main
  process crops the character's head from its waving sprite (the same crop as the tray icon) and hands the
  window a small PNG. The avatar sits on that character's colours, and each chat is tinted with its character
  too. The companion you pick in the app is saved as your avatar (`PUT /api/profiles/me`).
- **State** ([`chat.tsx`](../frontend/src/renderer/features/chat/chat.tsx)): `ChatProvider` holds the chat list,
  the loaded pages of each chat, unread counts and who is typing, and applies live events. A chat it hasn't
  seen yet (a friend's first message) reloads the list. Friends, groups and chats share one event stream
  ([`liveEvents.ts`](../frontend/src/renderer/services/liveEvents.ts)) instead of opening one each.
- **Group info panel** ([`GroupInfoPanel.tsx`](../frontend/src/renderer/features/chat/GroupInfoPanel.tsx)):
  members, invite a friend, invite link, reset link, **Edit details** (owner), leave. **New group**
  ([`NewChatMenus.tsx`](../frontend/src/renderer/features/chat/NewChatMenus.tsx)): name, description,
  character picker, friends to invite; or join with a link. **Friends**: a **💬 Chat** button per friend.

---

## 6. Testing

Everything below passed.

| What | Where | Result |
|---|---|---|
| Backend: whole API over HTTP against Postgres with the real Supabase migrations (throwaway container created per run, never your data) | `backend/` → `./mvnw test` | **69 / 69** (48 earlier + 21 chat) |
| App: layout rules, day labels, merging, previews | `frontend/` → `npm test` | **45 / 45** (8 chat) |
| End to end, **hosted Supabase**, Amy / Ben / Cleo, through nginx and the backend | `frontend/` → `npm run test:e2e` | **chat 11 / 11**, friends & groups 18 / 18 |
| The real app, as Amy, with Ben and Cleo acting through the API | Electron, driven and screenshotted | all flows below worked |

**Backend chat tests** (`GroupChatIntegrationTest`, `DirectMessageIntegrationTest`, `ChatEventIntegrationTest`):

- **The group's chat:** a new group gets exactly one chat, shows its description and character, and records
  "created" and "joined" notes.
- **Members only:** members chat with sender, avatar and time on each message; outsiders can't read, write,
  type or react (404).
- **Unread:** counts only others' messages until the chat is read; your own messages and replying count as
  read.
- **Joining and leaving:** joining by link or invitation adds you to the chat, and leaving removes you. The
  owner leaving hands over ownership with a note. The last member leaving deletes the group's chat and
  messages.
- **Paging:** 5 per page in the test, newest page first, `nextCursor` continues, last page ends; a page is
  never more than 50.
- **Message checks:** empty, 2001 characters (refused) and 2000 emoji (accepted).
- **Rate limit:** the 11th message within 10 seconds gets 429; others aren't affected; it passes again later.
- **Replies:** quote a message of the same chat only.
- **Edit and delete:** your own messages only. Deleting empties the text and drops reactions, and the app's
  notes can't be edited.
- **Reactions:** once per person and emoji, in picker order, can be taken back; unknown emoji refused.
- **Group details:** owner only; unknown characters and long descriptions refused; renaming adds a note.
- **Mute:** per person.
- **Direct chats:**
  - there is one chat per pair from either side, and the database itself refuses a second;
  - only friends can open one or send in it;
  - unfriending keeps the history but blocks sending and hides their status; friends again, the same chat
    continues;
  - others can't read it;
  - your picked character is your avatar everywhere.
- **Live events over real HTTP:** a direct message reaches both people only; typing reaches the others in the
  chat, not the typist or outsiders, and isn't stored; edits and reactions update live; someone joining gets
  the chat's messages from then on, not before.

**Hosted end-to-end** (`tests/e2e/chat.e2e.ts`, Amy, Ben, Cleo): the same scenarios against the real
database, in a throwaway group that is deleted afterwards (checked: no test group or burst messages left).

**In the real app** (this first round used the earlier layout; the current layout was tested in
[chats-page.md](chats-page.md)):
- **Navigation:** the sidebar lists the group and direct chats with unread badges, and opening a chat clears
  its badge.
- **Sending and live updates:** a message typed and sent with Enter appears for everyone; "Ben is typing…"
  and his reply arrive live.
- **Date lines:** date lines over three days, shown once each.
- **Message actions:** reacting with 👍 and replying with a quote.
- **Groups page:** the description field and the character picker.
- **Friends page:** **Message** opens the chat with Cleo, and her answer arrives live.

Bugs found by the tests and fixed on the way:
- Loading the reply previews crashed on messages without a reply. `Map.of().get(null)` throws in Java; every
  group creation returned 500 until fixed.
- The chat list's "is this a new chat?" check read state inside a React updater function, which may run
  later. It now reads a ref.

---

## 7. How the original design was mapped

The data design was written when the app still talked to Supabase directly. Since then the Spring Boot
backend holds all the rules, so a few points are implemented the Spring way:

| Original design | Implemented as | Why |
|---|---|---|
| Tables, columns, indexes, pair-uniqueness, `bigint identity` ids, soft delete, reactions | exactly as designed | |
| One chat per group, created automatically; joining/leaving updates membership | database triggers | holds however a group changes (also old app builds) |
| `send_message` database function (membership, rate limit, `last_message_at`) | `MessageService.sendMessage` (one transaction) | all rules live in tested Java services, like the rest of the backend |
| "Clients only read directly" | clients don't touch the tables at all; the backend reads and writes | the app holds no database keys |
| Realtime on messages filtered by conversation | SSE `message` / `message-updated` events to the chat's members, after commit | same live channel as friends and status |
| Typing as live-only Broadcast, never stored | SSE `typing` events, never stored | same |
| Group description + avatar or character theme | `description` + `character_id` (the five companions) | uses the characters already in the app |

---

## 8. Running it and applying the migration

The tables already exist in the hosted project. For another Supabase project, apply
`supabase/migrations/20261019000000_chat.sql`. Open SQL Editor → New query, paste the whole file with nothing
highlighted, and click Run. Then check:

```sql
select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'messages');
```

Run locally:

```sh
cd backend && ./mvnw spring-boot:run                 # API on :8080, connected to Supabase
docker compose -f docker-compose.dev.yml up -d       # nginx on :8088 (from the project root)
cd frontend && npm run start                         # the app
```

Tests: `cd backend && ./mvnw test` (needs Docker), `cd frontend && npm test`, and with the backend and nginx
running, `cd frontend && npm run test:e2e`.

---

## 9. Limits and next steps

- **One backend instance:** live events are kept in the backend's memory. To run several backends, add a
  shared message bus (e.g. Redis pub/sub) to `EventStreamService` first.
- **No desktop notifications yet** for new messages while the app is in the tray. The unread badges are there
  to build on.
- **Text only:** no images or files. Supabase Storage plus an `attachments` table would be the next step.
- **No search** in chat history yet. Postgres full-text search on `messages.body` would do it.
- **Edits keep no history** of earlier versions.
- **Demo data:** the test accounts keep three direct chats as demo data: Amy–Ben with messages over three
  days, Amy–Cleo, Ben–Cleo. Some messages in Amy–Ben were moved back one and two days in the database so
  the date lines show.

---

## 10. Files added and changed

**Database**: `supabase/migrations/20261019000000_chat.sql` (new).

**Backend** (`backend/src/main/java/com/desktopfriends/backend/`)

- New:
  - entities `Conversation`, `ConversationMember(+Id)`, `Message`, `MessageReaction(+Id)`, `ConversationKind`,
    `MessageKind`;
  - repositories `ConversationRepository`, `ConversationMemberRepository`, `MessageRepository`,
    `MessageReactionRepository`;
  - services `ConversationService`, `MessageService`; `mapper/MessageMapper`;
  - controllers `ConversationController`, `MessageController`;
  - DTOs `SendMessageRequest`, `EditMessageRequest`, `ReactionRequest`, `MuteConversationRequest`,
    `OpenDirectConversationRequest`, `UpdateGroupRequest`, `UpdateProfileRequest`, `ChatUserResponse`,
    `MessageResponse`, `MessagePageResponse`, `ReplyPreviewResponse`, `ReactionResponse`,
    `ConversationResponse`, `TypingEventResponse`;
  - `exception/TooManyRequestsException`; `util/CharacterCatalog`.
- Changed:
  - `GroupService` (description, character, edit details, chat notes, `conversationId`);
  - `GroupInvitationService` (join note);
  - `ProfileService` / `ProfileController` (character);
  - `Profile`, `FriendGroup`, `EnumConverters`, `SocialEvent` (chat events);
  - `SecurityConfig` (PATCH allowed);
  - the group/profile/friend response DTOs (`characterId`, `description`, `conversationId`).
- Tests: `GroupChatIntegrationTest`, `DirectMessageIntegrationTest`, `ChatEventIntegrationTest`,
  `support/EventStreamClient`, plus `befriend`/`patchAs` helpers.

**App** (`frontend/src/`)

- New:
  - `shared/chat.ts`;
  - `renderer/services/chat.ts`, `renderer/services/liveEvents.ts`;
  - `renderer/features/chat/` (`chat.tsx`, `ChatView.tsx`, `CharacterAvatar.tsx`; later also `ChatsPage.tsx`,
    `ChatList.tsx`, `NewChatMenus.tsx`, `GroupInfoPanel.tsx`, see [chats-page.md](chats-page.md)).
- Changed:
  - `App.tsx` (Chats navigation, avatar sync), `main.tsx` (`ChatProvider`);
  - `FriendPresence.tsx` (the old `GroupsPage.tsx` was later folded into the Chats page);
  - `social.tsx` (shared event stream);
  - `services/social.ts` (`createGroup`, `updateGroup`), `services/api.ts` (PATCH);
  - `shared/types.ts`, `shared/social.ts`, `styles.css`;
  - main process `trayIcon.ts` / `main.ts` and `preload.ts` / `env.d.ts` (portrait for avatars).
- Tests: `tests/chat.test.ts`, `tests/e2e/chat.e2e.ts`.
