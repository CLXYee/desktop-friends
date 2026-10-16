package com.desktopfriends.backend.entity;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;

/** What the app reports for a user: online while it runs, idle when they step away, offline otherwise. */
public enum PresenceStatus {
    ONLINE("online"),
    IDLE("idle"),
    OFFLINE("offline");

    private final String value;

    PresenceStatus(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    /** Parses "online", "idle" or "offline"; null for anything else. */
    @JsonCreator
    public static PresenceStatus fromValue(String value) {
        return Arrays.stream(values()).filter(status -> status.value.equals(value)).findFirst().orElse(null);
    }
}
