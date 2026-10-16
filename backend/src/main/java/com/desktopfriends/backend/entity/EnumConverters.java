package com.desktopfriends.backend.entity;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** The database stores these enums as lowercase text ('online', 'pending', 'owner', ...). */
public final class EnumConverters {

    private EnumConverters() {
    }

    @Converter(autoApply = true)
    public static class PresenceStatusConverter implements AttributeConverter<PresenceStatus, String> {
        @Override
        public String convertToDatabaseColumn(PresenceStatus status) {
            return status == null ? null : status.getValue();
        }

        @Override
        public PresenceStatus convertToEntityAttribute(String value) {
            return value == null ? null : PresenceStatus.fromValue(value);
        }
    }

    @Converter(autoApply = true)
    public static class FriendshipStatusConverter implements AttributeConverter<FriendshipStatus, String> {
        @Override
        public String convertToDatabaseColumn(FriendshipStatus status) {
            return status == null ? null : status.getValue();
        }

        @Override
        public FriendshipStatus convertToEntityAttribute(String value) {
            return value == null ? null : FriendshipStatus.fromValue(value);
        }
    }

    @Converter(autoApply = true)
    public static class GroupRoleConverter implements AttributeConverter<GroupRole, String> {
        @Override
        public String convertToDatabaseColumn(GroupRole role) {
            return role == null ? null : role.getValue();
        }

        @Override
        public GroupRole convertToEntityAttribute(String value) {
            return value == null ? null : GroupRole.fromValue(value);
        }
    }
}
