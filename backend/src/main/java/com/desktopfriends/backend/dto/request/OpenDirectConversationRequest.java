package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

/** Opens (or finds) the direct chat with a friend. */
public record OpenDirectConversationRequest(@NotNull(message = "Choose a friend to message.") UUID friendId) {
}
