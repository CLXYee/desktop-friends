package com.desktopfriends.backend.dto.response;

import com.desktopfriends.backend.entity.PresenceStatus;
import java.time.Instant;
import java.util.UUID;

/** Someone the user can see, with the status their friends see. */
public record FriendProfileResponse(
        UUID id, String username, String displayName, PresenceStatus presence, Instant lastSeenAt, String characterId) {
}
