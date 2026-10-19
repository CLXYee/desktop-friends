package com.desktopfriends.backend.dto.response;

/** The message a reply quotes: who wrote it and the start of what they wrote. */
public record ReplyPreviewResponse(long id, String senderName, String body, boolean deleted) {
}
