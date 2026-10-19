package com.desktopfriends.backend.dto.request;

/** What the owner changes about a group; anything left out (null) stays as it is. */
public record UpdateGroupRequest(String name, String description, String characterId) {
}
