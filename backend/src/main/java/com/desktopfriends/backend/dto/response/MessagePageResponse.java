package com.desktopfriends.backend.dto.response;

import java.util.List;

/**
 * Up to 50 messages, oldest first. When hasMore, ask for the page before nextCursor
 * (GET .../messages?before=nextCursor).
 */
public record MessagePageResponse(List<MessageResponse> messages, boolean hasMore, Long nextCursor) {
}
