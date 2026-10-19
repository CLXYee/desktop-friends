package com.desktopfriends.backend.controller;

import com.desktopfriends.backend.dto.request.MuteConversationRequest;
import com.desktopfriends.backend.dto.request.OpenDirectConversationRequest;
import com.desktopfriends.backend.dto.response.ConversationResponse;
import com.desktopfriends.backend.security.CurrentUserId;
import com.desktopfriends.backend.service.ConversationService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The user's chats: group chats and direct chats with friends. */
@RestController
@RequestMapping("/api/conversations")
public class ConversationController {

    private final ConversationService conversationService;

    public ConversationController(ConversationService conversationService) {
        this.conversationService = conversationService;
    }

    /** Every chat the user is in, most recently active first, with last message and unread count. */
    @GetMapping
    public List<ConversationResponse> listConversations(@CurrentUserId UUID userId) {
        return conversationService.listConversations(userId);
    }

    @GetMapping("/{conversationId}")
    public ConversationResponse getConversation(@CurrentUserId UUID userId, @PathVariable UUID conversationId) {
        return conversationService.getConversation(userId, conversationId);
    }

    /** Opens the direct chat with a friend (the same one every time). */
    @PostMapping("/direct")
    public ConversationResponse openDirectConversation(@CurrentUserId UUID userId, @Valid @RequestBody OpenDirectConversationRequest request) {
        return conversationService.openDirectConversation(userId, request.friendId());
    }

    @PostMapping("/{conversationId}/read")
    public ResponseEntity<Void> markRead(@CurrentUserId UUID userId, @PathVariable UUID conversationId) {
        conversationService.markRead(userId, conversationId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/{conversationId}/mute")
    public ResponseEntity<Void> setMuted(@CurrentUserId UUID userId, @PathVariable UUID conversationId,
            @Valid @RequestBody MuteConversationRequest request) {
        conversationService.setMuted(userId, conversationId, request.muted());
        return ResponseEntity.noContent().build();
    }

    /** "I'm typing": the others in the chat see it for a few seconds. Nothing is stored. */
    @PostMapping("/{conversationId}/typing")
    public ResponseEntity<Void> sendTyping(@CurrentUserId UUID userId, @PathVariable UUID conversationId) {
        conversationService.sendTyping(userId, conversationId);
        return ResponseEntity.noContent().build();
    }
}
