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

/** Who belongs to which group (public.group_members); each group has one owner. */
@Entity
@Table(name = "group_members")
@IdClass(GroupMemberId.class)
public class GroupMember {

    @Id
    @Column(name = "group_id")
    private UUID groupId;

    @Id
    @Column(name = "user_id")
    private UUID userId;

    /** Read-only view of the member's profile (for names and status). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", insertable = false, updatable = false)
    private Profile profile;

    @Column(nullable = false)
    private GroupRole role = GroupRole.MEMBER;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt;

    protected GroupMember() {
    }

    public GroupMember(UUID groupId, Profile profile, GroupRole role, Instant joinedAt) {
        this.groupId = groupId;
        this.userId = profile.getId();
        this.profile = profile;
        this.role = role;
        this.joinedAt = joinedAt;
    }

    public UUID getGroupId() {
        return groupId;
    }

    public UUID getUserId() {
        return userId;
    }

    public Profile getProfile() {
        return profile;
    }

    public GroupRole getRole() {
        return role;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }

    public boolean isOwner() {
        return role == GroupRole.OWNER;
    }

    public void promoteToOwner() {
        this.role = GroupRole.OWNER;
    }
}
