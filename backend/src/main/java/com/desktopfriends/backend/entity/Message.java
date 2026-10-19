package com.desktopfriends.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * A chat message (public.messages). Ids grow with every message, so they order a chat and page it
 * ("older than id X"). Deleting empties the body and keeps the row.
 */
@Entity
@Table(name = "messages")
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "conversation_id", nullable = false, updatable = false)
    private UUID conversationId;

    /** Null once the sender's account is deleted. */
    @Column(name = "sender_id", updatable = false)
    private UUID senderId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id", insertable = false, updatable = false)
    private Profile sender;

    @Column(nullable = false)
    private String body;

    @Column(nullable = false, updatable = false)
    private MessageKind kind = MessageKind.TEXT;

    @Column(name = "reply_to_id", updatable = false)
    private Long replyToId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "edited_at")
    private Instant editedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Message() {
    }

    public Message(UUID conversationId, Profile sender, String body, MessageKind kind, Long replyToId, Instant createdAt) {
        this.conversationId = conversationId;
        this.senderId = sender == null ? null : sender.getId();
        this.sender = sender;
        this.body = body;
        this.kind = kind;
        this.replyToId = replyToId;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public UUID getConversationId() {
        return conversationId;
    }

    public UUID getSenderId() {
        return senderId;
    }

    public Profile getSender() {
        return sender;
    }

    public String getBody() {
        return body;
    }

    public MessageKind getKind() {
        return kind;
    }

    public Long getReplyToId() {
        return replyToId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getEditedAt() {
        return editedAt;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }

    public boolean isDeleted() {
        return deletedAt != null;
    }

    public void edit(String body, Instant at) {
        this.body = body;
        this.editedAt = at;
    }

    /** Soft delete: the text is gone for good, the row stays so the chat keeps its shape. */
    public void delete(Instant at) {
        this.body = "";
        this.deletedAt = at;
    }
}
