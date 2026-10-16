package com.desktopfriends.backend.dto.response;

import com.desktopfriends.backend.entity.GroupRole;
import com.desktopfriends.backend.entity.PresenceStatus;
import java.time.Instant;
import java.util.UUID;

public record GroupMemberResponse(
        UUID id, String username, String displayName, PresenceStatus presence, Instant lastSeenAt, GroupRole role, Instant joinedAt) {
}
