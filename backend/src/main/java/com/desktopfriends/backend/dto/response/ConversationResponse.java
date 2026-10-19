package com.desktopfriends.backend.dto.response;

import com.desktopfriends.backend.entity.ConversationKind;
import java.time.Instant;
import java.util.UUID;

/**
 * A chat in the user's list. title and characterId are the group's (group chat) or the friend's (direct chat).
 * canSend is false in a direct chat with someone who is no longer a friend.
 */
public record ConversationResponse(
        UUID id,
        ConversationKind kind,
        String title,
        String characterId,
        GroupSummary group,
        FriendProfileResponse partner,
        boolean canSend,
        MessageResponse lastMessage,
        Instant lastMessageAt,
        long unreadCount,
        boolean muted,
        Instant createdAt) {

    /** The group a group chat belongs to. */
    public record GroupSummary(UUID id, String description, int memberCount) {
    }
}
