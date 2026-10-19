# Desktop Friends backend

Spring Boot 4 (Java 21) REST API for Desktop Friends: accounts, friends, online status, groups, chats
(group chats and direct messages) and live updates. The chat feature is described in detail in
[docs/chat.md](../docs/chat.md). Data stays in the hosted **Supabase** project: accounts in Supabase Auth, everything else in its
Postgres. The desktop app only talks to this API (through nginx); it never calls Supabase directly.

## Run it

```sh
cp .env.example .env              # then fill it in (see below)
./mvnw spring-boot:run            # Windows: mvnw.cmd spring-boot:run  → http://localhost:8080
./mvnw test                       # all tests (needs Docker running)
./mvnw package                    # target/desktop-friends-backend.jar (java -jar …)
```

Maven comes with the project (the Maven Wrapper downloads it on first use); only Java 21+ is needed.

### Settings (`backend/.env` or environment variables)

| Variable | What |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` (Supabase → Project Settings → API) |
| `SUPABASE_PUBLISHABLE_KEY` | The project's publishable key, used to call Supabase Auth |
| `SUPABASE_DB_URL` | `jdbc:postgresql://aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require` (Supabase → Connect → **Session pooler**; the direct host is IPv6-only) |
| `SUPABASE_DB_USER` | `postgres.<ref>` |
| `SUPABASE_DB_PASSWORD` | The database password (Project Settings → Database) |
| `PORT` | Optional, default 8080 |
| `CORS_ALLOWED_ORIGINS` | Optional, default `http://localhost:5173,file://,null` (Vite dev server and the packaged app) |

`.env` is git-ignored. Spring reads it as a properties file when started from this folder; Docker Compose
passes it as environment variables.

## How it is organized

```
src/main/java/com/desktopfriends/backend/
├── DesktopFriendsBackendApplication.java
├── controller/   HTTP endpoints only: read the request, call one service method, return a DTO
│                 AuthController, ProfileController, FriendshipController, PresenceController,
│                 GroupController, GroupInvitationController, ConversationController, MessageController,
│                 EventController
├── service/      The rules (what used to be database functions)
│                 AuthService, ProfileService, FriendshipService, PresenceService, GroupService,
│                 GroupInvitationService, ConversationService, MessageService, EventStreamService,
│                 InviteCodeGenerator
├── mapper/       MessageMapper: messages → responses, loading senders, replies and reactions per page
├── repository/   Spring Data JPA: ProfileRepository, FriendshipRepository, FriendGroupRepository,
│                 GroupMemberRepository, GroupInvitationRepository, ConversationRepository,
│                 ConversationMemberRepository, MessageRepository, MessageReactionRepository
├── entity/       JPA entities on the Supabase tables: Profile, Friendship, FriendGroup, GroupMember,
│                 GroupInvitation, Conversation, ConversationMember, Message, MessageReaction
│                 (+ enums PresenceStatus, FriendshipStatus, GroupRole, ConversationKind, MessageKind)
├── dto/request/  …Request records (validated with Jakarta Validation)
├── dto/response/ …Response records (what the app receives)
├── client/       SupabaseAuthClient: the only HTTP calls to Supabase (sign up, log in, refresh, log out)
├── event/        SocialEvent + SocialEventListener: live updates, sent after the transaction commits
├── security/     Token checks (SupabaseJwtValidators), @CurrentUserId, JSON 401/403 responses
├── exception/    ApiException family (BadRequest, NotFound, Conflict, Forbidden, TooManyRequests,
│                 AuthenticationFailed)
│                 + GlobalExceptionHandler
├── config/       SecurityConfig, WebConfig, ClockConfig, SupabaseProperties, CorsProperties
└── util/         AccountRules (username and password rules, same as the app's), CharacterCatalog
```

Naming follows Spring conventions: `XxxController` → `XxxService` → `XxxRepository` → entity `Xxx`;
requests are `XxxRequest`, responses `XxxResponse`; configuration classes are `XxxConfig` and
`XxxProperties`. Controllers hold no logic; services are `@Transactional`; the schema is never changed by
Hibernate (`ddl-auto: none`). It comes from `../supabase/migrations`.

## API

Everything is under `/api`. All endpoints except the first three and the health check need
`Authorization: Bearer <accessToken>` (a Supabase access token from log in / sign up / refresh). Errors are
always `{"status": <code>, "error": "<message for people>"}`.

| Method | Path | Body | Answer |
|---|---|---|---|
| POST | `/api/auth/signup` | `{displayName, username, password}` | 201 session (`accessToken, refreshToken, expiresAt, profile`) |
| POST | `/api/auth/login` | `{username, password}` | session |
| POST | `/api/auth/refresh` | `{refreshToken}` | new session (refresh tokens work once) |
| POST | `/api/auth/logout` | | 204; marks you offline and ends the session |
| GET | `/api/health` | | `{"status":"UP"}` (public) |
| GET | `/api/profiles/me` | | your profile (with `characterId`, your avatar) |
| PUT | `/api/profiles/me` | `{characterId}` | your profile; sets your avatar (one of the five companions) |
| GET | `/api/friends` | | `{friends, incoming, outgoing}` with each friend's `presence` |
| POST | `/api/friends/requests` | `{username}` | 201 `{status: "pending" \| "accepted"}` (accepted if they had asked you) |
| POST | `/api/friends/requests/{id}/accept` | | 204 |
| POST | `/api/friends/requests/{id}/decline` | | 204 |
| DELETE | `/api/friends/{friendId}` | | 204; unfriend, or cancel your request |
| PUT | `/api/presence` | `{status: "online" \| "idle" \| "offline"}` | 204 (also the 1-minute heartbeat) |
| GET | `/api/groups` | | your groups, members owner-first, `invitedIds` |
| POST | `/api/groups` | `{name, description?, characterId?}` | 201 the group (you are its owner), with its `conversationId` |
| PATCH | `/api/groups/{id}` | `{name?, description?, characterId?}` | the group (owner only) |
| POST | `/api/groups/join` | `{code}` (code or full invite link) | `{groupId, groupName}` |
| POST | `/api/groups/{id}/invitations` | `{friendId}` | 201 (members invite their friends) |
| POST | `/api/groups/{id}/leave` | | 204 (owner leaving hands over; last one out deletes the group) |
| POST | `/api/groups/{id}/invite-code/reset` | | `{inviteCode}` (owner only) |
| GET | `/api/group-invitations` | | invitations sent to you |
| POST | `/api/group-invitations/{id}/accept` | | `{groupId, groupName}` |
| POST | `/api/group-invitations/{id}/decline` | | 204 |
| GET | `/api/conversations` | | your chats (group and direct), most recent first, with last message and unread count |
| GET | `/api/conversations/{id}` | | one chat |
| POST | `/api/conversations/direct` | `{friendId}` | your chat with a friend (created the first time; friends only) |
| GET | `/api/conversations/{id}/messages?before=&limit=` | | up to 50 messages, oldest first, `hasMore`, `nextCursor` |
| POST | `/api/conversations/{id}/messages` | `{body, replyToId?}` | 201 the message (members only; 1–2000 characters; 10 per 10 s) |
| POST | `/api/conversations/{id}/read` | | 204 |
| PUT | `/api/conversations/{id}/mute` | `{muted}` | 204 |
| POST | `/api/conversations/{id}/typing` | | 204; others see "… is typing" (not stored) |
| PATCH | `/api/messages/{id}` | `{body}` | the edited message (your own) |
| DELETE | `/api/messages/{id}` | | 204; soft delete (your own) |
| PUT | `/api/messages/{id}/reactions` | `{emoji}` | the message (one of 👍 ❤️ 😂 😮 😢 🎉) |
| DELETE | `/api/messages/{id}/reactions?emoji=` | | the message |
| GET | `/api/events` | | Server-Sent Events: `ready`, then `friends` / `groups` (reload), `presence` (`{userId, presence, lastSeenAt}`), `message` / `message-updated` (the message) and `typing` (`{conversationId, user}`) |

Rules worth knowing:

- A friend request reveals the requester to the person asked, but not the other way round: you see whom you
  asked, not their status, until they accept. Friends and fellow group members see your status.
- Status is what the app last reported, unless it hasn't reported for 3 minutes (crashed, no network): then
  it shows as offline.
- Live events go only to the people a change concerns, after it is committed. Status events are sent when
  what people see changes, not on every heartbeat.

## Tests

`./mvnw test` runs 70 tests in about 40 seconds:

- **Integration tests** (`controller/*IntegrationTest`): the whole app over HTTP, with real security, against
  Postgres 17 in Docker (Testcontainers) carrying the real `supabase/migrations`, and a stand-in for Supabase
  Auth that issues real ES256 tokens (`support/FakeSupabaseAuthServer`). They cover sign-up/log-in/refresh/
  log-out, token checks (wrong key, issuer, audience, role, expired), friends, status (including going stale),
  groups and invitations, group chats and direct messages (members only, friends only, paging, unread,
  rate limit, replies, edits, reactions), live events reaching exactly the right people, and CORS.
- **Unit tests**: account rules, invite codes, Supabase Auth error messages, error responses (a change that
  clashes with another one is a 409, not a 500).

The app's end-to-end test (`frontend`, `npm run test:e2e`) then runs the same scenarios against the real
Supabase project through nginx.

## Deploying

`docker compose up -d --build` from the project root builds this folder's `Dockerfile` (Maven Wrapper build,
Java 21 JRE, non-root user, health check on `/api/health`) and runs it behind nginx.

- Run **one instance**: live event streams are kept in memory. To run more, add a shared message bus (e.g.
  Redis pub/sub) to `EventStreamService` first.
- The backend connects to Postgres as the database owner, so row-level security doesn't apply to it; the
  services check every rule themselves. Keep `backend/.env` on the server only.
- Shutting down closes all event streams right away; the apps reconnect on their own.
