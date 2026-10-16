package com.desktopfriends.backend.dto.response;

/** Every error the API returns: the HTTP status and a message the app can show as is. */
public record ErrorResponse(int status, String error) {
}
