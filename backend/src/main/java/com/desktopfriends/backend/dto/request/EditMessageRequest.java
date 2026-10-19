package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotNull;

public record EditMessageRequest(@NotNull(message = "Write a message first.") String body) {
}
