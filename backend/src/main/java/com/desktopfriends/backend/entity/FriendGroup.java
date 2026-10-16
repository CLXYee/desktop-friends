package com.desktopfriends.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** A group of friends (public.groups). Members are in group_members. */
@Entity
@Table(name = "groups")
public class FriendGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    /** Anyone holding this code (shared as an invite link) can join; the owner can replace it. */
    @Column(name = "invite_code", nullable = false, unique = true)
    private String inviteCode;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected FriendGroup() {
    }

    public FriendGroup(String name, String inviteCode, UUID createdBy, Instant createdAt) {
        this.name = name;
        this.inviteCode = inviteCode;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getInviteCode() {
        return inviteCode;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void replaceInviteCode(String inviteCode) {
        this.inviteCode = inviteCode;
    }
}
