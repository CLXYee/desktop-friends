package com.desktopfriends.backend.entity;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;

/** Each group has one owner; everyone else is a member. */
public enum GroupRole {
    OWNER("owner"),
    MEMBER("member");

    private final String value;

    GroupRole(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    public static GroupRole fromValue(String value) {
        return Arrays.stream(values()).filter(role -> role.value.equals(value)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown group role: " + value));
    }
}
