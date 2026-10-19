package com.desktopfriends.backend.controller;

import com.desktopfriends.backend.dto.request.EditMessageRequest;
import com.desktopfriends.backend.dto.request.ReactionRequest;
import com.desktopfriends.backend.dto.request.SendMessageRequest;
import com.desktopfriends.backend.dto.response.MessagePageResponse;
import com.desktopfriends.backend.dto.response.MessageResponse;
import com.desktopfriends.backend.security.CurrentUserId;
import com.desktopfriends.backend.service.MessageService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Messages in a chat: read page by page, send, edit, delete, react. */
@RestController
public class MessageController {

    private final MessageService messageService;

    public MessageController(MessageService messageService) {
        this.messageService = messageService;
    }

    /** Up to 50 messages, oldest first; pass the previous page's nextCursor as before for older ones. */
    @GetMapping("/api/conversations/{conversationId}/messages")
    public MessagePageResponse listMessages(@CurrentUserId UUID userId, @PathVariable UUID conversationId,
            @RequestParam(required = false) Long before, @RequestParam(required = false) Integer limit) {
        return messageService.listMessages(userId, conversationId, before, limit);
    }

    @PostMapping("/api/conversations/{conversationId}/messages")
    public ResponseEntity<MessageResponse> sendMessage(@CurrentUserId UUID userId, @PathVariable UUID conversationId,
            @Valid @RequestBody SendMessageRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(messageService.sendMessage(userId, conversationId, request.body(), request.replyToId()));
    }

    @PatchMapping("/api/messages/{messageId}")
    public MessageResponse editMessage(@CurrentUserId UUID userId, @PathVariable long messageId,
            @Valid @RequestBody EditMessageRequest request) {
        return messageService.editMessage(userId, messageId, request.body());
    }

    @DeleteMapping("/api/messages/{messageId}")
    public ResponseEntity<Void> deleteMessage(@CurrentUserId UUID userId, @PathVariable long messageId) {
        messageService.deleteMessage(userId, messageId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/api/messages/{messageId}/reactions")
    public MessageResponse addReaction(@CurrentUserId UUID userId, @PathVariable long messageId,
            @Valid @RequestBody ReactionRequest request) {
        return messageService.addReaction(userId, messageId, request.emoji());
    }

    @DeleteMapping("/api/messages/{messageId}/reactions")
    public MessageResponse removeReaction(@CurrentUserId UUID userId, @PathVariable long messageId, @RequestParam String emoji) {
        return messageService.removeReaction(userId, messageId, emoji);
    }
}
