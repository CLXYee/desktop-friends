package com.desktopfriends.backend.dto.response;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A group the user belongs to: its details, its chat (conversationId), members (owner first, then by joining
 * order) and who is invited.
 */
public record GroupResponse(
        UUID id, String name, String description, String characterId, String inviteCode, Instant createdAt,
        UUID conversationId, List<GroupMemberResponse> members, List<UUID> invitedIds) {
}
