package com.desktopfriends.backend.entity;

import com.fasterxml.jackson.annotation.JsonValue;
import java.util.Arrays;

/** A group's chat, or a direct chat between two friends. */
public enum ConversationKind {
    DIRECT("direct"),
    GROUP("group");

    private final String value;

    ConversationKind(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    public static ConversationKind fromValue(String value) {
        return Arrays.stream(values()).filter(kind -> kind.value.equals(value)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown conversation kind: " + value));
    }
}
