package com.desktopfriends.backend.util;

import java.util.List;

/** The companion characters the app ships (frontend/src/shared/characters.ts); used as avatars and themes. */
public final class CharacterCatalog {

    public static final List<String> CHARACTER_IDS = List.of("crystal", "lovie", "cloudy", "starry", "clover");
    public static final String DEFAULT_CHARACTER_ID = "crystal";

    private CharacterCatalog() {
    }

    public static boolean isKnown(String characterId) {
        return characterId != null && CHARACTER_IDS.contains(characterId);
    }
}
