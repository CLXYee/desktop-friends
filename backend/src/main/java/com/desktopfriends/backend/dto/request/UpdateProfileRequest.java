package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotBlank;

/** The companion character the user picked in the app (their avatar in chats). */
public record UpdateProfileRequest(@NotBlank(message = "Pick a character.") String characterId) {
}
