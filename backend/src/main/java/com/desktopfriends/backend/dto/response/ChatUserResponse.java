package com.desktopfriends.backend.dto.response;

import java.util.UUID;

/** Someone in a chat: their name and the character shown as their avatar. */
public record ChatUserResponse(UUID id, String username, String displayName, String characterId) {
}
