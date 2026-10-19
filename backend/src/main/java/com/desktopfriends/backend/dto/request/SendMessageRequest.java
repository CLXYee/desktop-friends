package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotNull;

/** A new message; replyToId quotes an earlier message of the same chat. */
public record SendMessageRequest(@NotNull(message = "Write a message first.") String body, Long replyToId) {
}
