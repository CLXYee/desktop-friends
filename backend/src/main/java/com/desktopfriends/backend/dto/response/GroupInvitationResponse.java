package com.desktopfriends.backend.dto.response;

import java.time.Instant;
import java.util.UUID;

/** An invitation sent to the user. */
public record GroupInvitationResponse(UUID id, UUID groupId, String groupName, InviterResponse inviter, Instant createdAt) {

    public record InviterResponse(String username, String displayName) {
    }
}
