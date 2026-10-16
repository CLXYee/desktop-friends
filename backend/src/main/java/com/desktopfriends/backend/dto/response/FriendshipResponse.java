package com.desktopfriends.backend.dto.response;

import java.time.Instant;
import java.util.UUID;

/** A friendship from the user's side: kind is "friend", "incoming" (waiting for you) or "outgoing". */
public record FriendshipResponse(UUID id, String kind, FriendProfileResponse friend, Instant createdAt) {
}
