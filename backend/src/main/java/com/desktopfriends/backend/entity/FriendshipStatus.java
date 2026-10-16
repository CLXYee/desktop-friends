package com.desktopfriends.backend.entity;

import java.util.Arrays;

/** A friendship row is a request until the other person accepts it. */
public enum FriendshipStatus {
    PENDING("pending"),
    ACCEPTED("accepted");

    private final String value;

    FriendshipStatus(String value) {
        this.value = value;
    }

    public String getValue() {
        return value;
    }

    public static FriendshipStatus fromValue(String value) {
        return Arrays.stream(values()).filter(status -> status.value.equals(value)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown friendship status: " + value));
    }
}
