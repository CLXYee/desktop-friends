package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotBlank;

/** Send a friend request to the person with this username. */
public record AddFriendRequest(@NotBlank(message = "Enter their username.") String username) {
}
