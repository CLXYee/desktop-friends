package com.desktopfriends.backend.dto.response;

/** "pending" once sent, or "accepted" when the other person had already asked. */
public record FriendRequestResponse(String status) {
}
