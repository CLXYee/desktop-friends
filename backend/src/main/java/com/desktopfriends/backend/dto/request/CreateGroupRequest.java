package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotNull;

/** A new group; description and characterId are optional. */
public record CreateGroupRequest(
        @NotNull(message = "Group names are 1–40 characters.") String name,
        String description,
        String characterId) {
}
