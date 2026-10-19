package com.desktopfriends.backend.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** The composite key of message_reactions: (message_id, user_id, emoji). */
public class MessageReactionId implements Serializable {

    private Long messageId;
    private UUID userId;
    private String emoji;

    protected MessageReactionId() {
    }

    public MessageReactionId(Long messageId, UUID userId, String emoji) {
        this.messageId = messageId;
        this.userId = userId;
        this.emoji = emoji;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof MessageReactionId that && Objects.equals(messageId, that.messageId)
                && Objects.equals(userId, that.userId) && Objects.equals(emoji, that.emoji);
    }

    @Override
    public int hashCode() {
        return Objects.hash(messageId, userId, emoji);
    }
}
