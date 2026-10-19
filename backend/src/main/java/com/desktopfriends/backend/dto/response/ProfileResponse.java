package com.desktopfriends.backend.dto.response;

import java.util.UUID;

/** The signed-in user's own profile; characterId is the companion shown as their avatar. */
public record ProfileResponse(UUID id, String username, String displayName, String role, String characterId) {
}
