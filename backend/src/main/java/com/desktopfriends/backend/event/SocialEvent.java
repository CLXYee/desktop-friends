package com.desktopfriends.backend.event;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

/**
 * Something changed that the given users should see. Delivered on their live event stream once the
 * change is committed; the app reacts by reloading (friends, groups) or updating a status in place.
 *
 * @param name "friends", "groups", "presence", "message", "message-updated" or "typing"
 * @param data what the app needs for the update (null when it just reloads)
 */
public record SocialEvent(Set<UUID> recipientIds, String name, Object data) {

    public static final String FRIENDS = "friends";
    public static final String GROUPS = "groups";
    public static final String PRESENCE = "presence";
    /** A new chat message (data: the message). */
    public static final String MESSAGE = "message";
    /** A message was edited, deleted or reacted to (data: the message as it is now). */
    public static final String MESSAGE_UPDATED = "message-updated";
    /** Someone is typing (data: who and where); never stored. */
    public static final String TYPING = "typing";

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
