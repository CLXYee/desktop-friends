package com.desktopfriends.backend.dto.response;

import com.desktopfriends.backend.entity.MessageKind;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * A chat message. sender is null once their account is gone; body is empty when deleted; kind "system" is a
 * note from the app ("Ben joined the group").
 */
public record MessageResponse(
        long id,
        UUID conversationId,
        ChatUserResponse sender,
        String body,
        MessageKind kind,
        ReplyPreviewResponse replyTo,
        Instant createdAt,
        Instant editedAt,
        boolean deleted,
        List<ReactionResponse> reactions) {
}
