package com.desktopfriends.backend.event;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/**
 * Something changed that the given users should see. Delivered on their live event stream once the
 * change is committed; the app reacts by reloading (friends, groups) or updating a status in place.
 *
 * @param name "friends", "groups" or "presence"
 * @param data what the app needs for the update (null when it just reloads)
 */
public record SocialEvent(Set<UUID> recipientIds, String name, Object data) {

    public static final String FRIENDS = "friends";
    public static final String GROUPS = "groups";
    public static final String PRESENCE = "presence";

    public SocialEvent {
        recipientIds = Set.copyOf(recipientIds);
    }

    public static SocialEvent friendsChanged(Collection<UUID> recipientIds) {
        return new SocialEvent(Set.copyOf(recipientIds), FRIENDS, null);
    }

    public static SocialEvent groupsChanged(Collection<UUID> recipientIds) {
        return new SocialEvent(Set.copyOf(recipientIds), GROUPS, null);
    }
}
