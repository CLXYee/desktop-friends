package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotNull;

public record CreateGroupRequest(@NotNull(message = "Group names are 1–40 characters.") String name) {
}
