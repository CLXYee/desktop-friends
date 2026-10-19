package com.desktopfriends.backend.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** The composite key of conversation_members: (conversation_id, user_id). */
public class ConversationMemberId implements Serializable {

    private UUID conversationId;
    private UUID userId;

    protected ConversationMemberId() {
    }

    public ConversationMemberId(UUID conversationId, UUID userId) {
        this.conversationId = conversationId;
        this.userId = userId;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof ConversationMemberId that
                && Objects.equals(conversationId, that.conversationId) && Objects.equals(userId, that.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(conversationId, userId);
    }
}
