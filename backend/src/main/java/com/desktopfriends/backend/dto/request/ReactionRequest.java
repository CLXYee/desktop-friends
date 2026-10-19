package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotBlank;

public record ReactionRequest(@NotBlank(message = "Pick a reaction.") String emoji) {
}
