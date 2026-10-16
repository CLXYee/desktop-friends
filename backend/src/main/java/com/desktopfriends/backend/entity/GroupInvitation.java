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

/** A pending invitation to join a group, sent to a friend (public.group_invitations). Answering deletes it. */
@Entity
@Table(name = "group_invitations")
public class GroupInvitation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "group_id", nullable = false, updatable = false)
    private UUID groupId;

    @Column(name = "inviter_id", nullable = false, updatable = false)
    private UUID inviterId;

    @Column(name = "invitee_id", nullable = false, updatable = false)
    private UUID inviteeId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "group_id", insertable = false, updatable = false)
    private FriendGroup group;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inviter_id", insertable = false, updatable = false)
    private Profile inviter;

    protected GroupInvitation() {
    }

    public GroupInvitation(UUID groupId, UUID inviterId, UUID inviteeId, Instant createdAt) {
        this.groupId = groupId;
        this.inviterId = inviterId;
        this.inviteeId = inviteeId;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public UUID getGroupId() {
        return groupId;
    }

    public UUID getInviterId() {
        return inviterId;
    }

    public UUID getInviteeId() {
        return inviteeId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public FriendGroup getGroup() {
        return group;
    }

    public Profile getInviter() {
        return inviter;
    }
}
