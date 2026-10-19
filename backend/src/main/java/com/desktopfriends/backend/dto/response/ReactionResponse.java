package com.desktopfriends.backend.dto.response;

import java.util.List;
import java.util.UUID;

/** One emoji on a message and who reacted with it. */
public record ReactionResponse(String emoji, List<UUID> userIds) {
}
