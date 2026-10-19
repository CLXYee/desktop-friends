package com.desktopfriends.backend.entity;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;

/** Something someone wrote, or a note from the app ("Ben joined the group"). */
public enum MessageKind {
    TEXT("text"),
    SYSTEM("system");

    private final String value;

    MessageKind(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    public static MessageKind fromValue(String value) {
        return Arrays.stream(values()).filter(kind -> kind.value.equals(value)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown message kind: " + value));
    }
}
