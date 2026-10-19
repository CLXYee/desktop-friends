package com.desktopfriends.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A chat (public.conversations): a group's chat (created by the database with the group) or a direct chat
 * between two people (at most one per pair).
 */
@Entity
@Table(name = "conversations")
public class Conversation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, updatable = false)
    private ConversationKind kind;

    @Column(name = "group_id", updatable = false)
    private UUID groupId;

    @Column(name = "direct_user_a", updatable = false)
    private UUID directUserA;

    @Column(name = "direct_user_b", updatable = false)
    private UUID directUserB;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "last_message_at")
    private Instant lastMessageAt;

    protected Conversation() {
    }

    public static Conversation direct(UUID userA, UUID userB, Instant createdAt) {
        Conversation conversation = new Conversation();
        conversation.kind = ConversationKind.DIRECT;
        conversation.directUserA = userA;
        conversation.directUserB = userB;
        conversation.createdAt = createdAt;
        return conversation;
    }

    public UUID getId() {
        return id;
    }

    public ConversationKind getKind() {
        return kind;
    }

    public boolean isDirect() {
        return kind == ConversationKind.DIRECT;
    }

    public UUID getGroupId() {
        return groupId;
    }

    /** For a direct chat: the other person, seen from the given user. */
    public UUID otherParticipant(UUID userId) {
        return userId.equals(directUserA) ? directUserB : directUserA;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getLastMessageAt() {
        return lastMessageAt;
    }

    public void recordMessageAt(Instant at) {
        if (lastMessageAt == null || at.isAfter(lastMessageAt)) lastMessageAt = at;
    }
}
