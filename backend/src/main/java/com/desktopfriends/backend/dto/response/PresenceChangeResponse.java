package com.desktopfriends.backend.dto.response;

import com.desktopfriends.backend.entity.PresenceStatus;
import java.time.Instant;
import java.util.UUID;

/** Sent on the live event stream when someone the user can see changes status. */
public record PresenceChangeResponse(UUID userId, PresenceStatus presence, Instant lastSeenAt) {
}
