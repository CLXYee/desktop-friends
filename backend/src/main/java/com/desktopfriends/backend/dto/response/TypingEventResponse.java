package com.desktopfriends.backend.dto.response;

import java.util.UUID;

/** Sent on the live event stream while someone types; never stored. */
public record TypingEventResponse(UUID conversationId, ChatUserResponse user) {
}
