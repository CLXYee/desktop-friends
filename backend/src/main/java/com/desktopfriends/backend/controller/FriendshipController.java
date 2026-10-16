package com.desktopfriends.backend.controller;

import com.desktopfriends.backend.dto.request.AddFriendRequest;
import com.desktopfriends.backend.dto.response.FriendListResponse;
import com.desktopfriends.backend.dto.response.FriendRequestResponse;
import com.desktopfriends.backend.security.CurrentUserId;
import com.desktopfriends.backend.service.FriendshipService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Friends and friend requests. */
@RestController
@RequestMapping("/api/friends")
public class FriendshipController {

    private final FriendshipService friendshipService;

    public FriendshipController(FriendshipService friendshipService) {
        this.friendshipService = friendshipService;
    }

    /** Friends (with status), requests waiting for you, and requests you sent. */
    @GetMapping
    public FriendListResponse listFriendships(@CurrentUserId UUID userId) {
        return friendshipService.listFriendships(userId);
    }

    /** Sends a request by username ("pending"), or accepts theirs if they had already asked ("accepted"). */
    @PostMapping("/requests")
    public ResponseEntity<FriendRequestResponse> sendRequest(@CurrentUserId UUID userId, @Valid @RequestBody AddFriendRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(friendshipService.sendRequest(userId, request.username()));
    }

    @PostMapping("/requests/{requestId}/accept")
    public ResponseEntity<Void> acceptRequest(@CurrentUserId UUID userId, @PathVariable UUID requestId) {
        friendshipService.acceptRequest(userId, requestId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/requests/{requestId}/decline")
    public ResponseEntity<Void> declineRequest(@CurrentUserId UUID userId, @PathVariable UUID requestId) {
        friendshipService.declineRequest(userId, requestId);
        return ResponseEntity.noContent().build();
    }

    /** Unfriends someone, or cancels the request you sent them. */
    @DeleteMapping("/{friendId}")
    public ResponseEntity<Void> removeFriend(@CurrentUserId UUID userId, @PathVariable UUID friendId) {
        friendshipService.removeFriend(userId, friendId);
        return ResponseEntity.noContent().build();
    }
}
