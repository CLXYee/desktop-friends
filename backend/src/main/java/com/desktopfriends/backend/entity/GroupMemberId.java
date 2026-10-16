package com.desktopfriends.backend.entity;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

/** The composite key of group_members: (group_id, user_id). */
public class GroupMemberId implements Serializable {

    private UUID groupId;
    private UUID userId;

    protected GroupMemberId() {
    }

    public GroupMemberId(UUID groupId, UUID userId) {
        this.groupId = groupId;
        this.userId = userId;
    }

    public UUID getGroupId() {
        return groupId;
    }

    public UUID getUserId() {
        return userId;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof GroupMemberId that && Objects.equals(groupId, that.groupId) && Objects.equals(userId, that.userId);
    }

    @Override
    public int hashCode() {
        return Objects.hash(groupId, userId);
    }
}
