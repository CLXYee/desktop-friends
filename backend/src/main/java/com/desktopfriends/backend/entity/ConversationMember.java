package com.desktopfriends.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * Who is in which chat (public.conversation_members): the access rule, and where they have read up to.
 * Read state and mute are changed with single-statement updates (ConversationMemberRepository), so they
 * can't clash with someone leaving the chat at the same moment.
 * Group chats get their members from the database as people join and leave the group.
 */
@Entity
@Table(name = "conversation_members")
@IdClass(ConversationMemberId.class)
public class ConversationMember {

    @Id
    @Column(name = "conversation_id")
    private UUID conversationId;

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    private Profile profile;

    /** Messages after this are unread. */
    @Column(name = "last_read_at", nullable = false)
    private Instant lastReadAt;

    @Column(nullable = false)
    private boolean muted;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    protected ConversationMember() {
    }

    public ConversationMember(UUID conversationId, Profile profile, Instant joinedAt) {
        this.conversationId = conversationId;
        this.userId = profile.getId();
        this.profile = profile;
        this.lastReadAt = joinedAt;
        this.joinedAt = joinedAt;
    }

    public UUID getConversationId() {
        return conversationId;
    }

    public UUID getUserId() {
        return userId;
    }

    public Profile getProfile() {
        return profile;
    }

    public Instant getLastReadAt() {
        return lastReadAt;
    }

    public boolean isMuted() {
        return muted;
    }
}
