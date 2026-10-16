package com.desktopfriends.backend.dto.response;

import java.util.List;

/** Friends, requests waiting for the user, and requests they sent (without the other person's status). */
public record FriendListResponse(List<FriendshipResponse> friends, List<FriendshipResponse> incoming, List<FriendshipResponse> outgoing) {
}
