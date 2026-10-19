package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotNull;

public record MuteConversationRequest(@NotNull(message = "Say whether to mute the chat.") Boolean muted) {
}
