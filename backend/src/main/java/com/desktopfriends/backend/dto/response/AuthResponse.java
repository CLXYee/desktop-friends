package com.desktopfriends.backend.dto.response;

/**
 * A signed-in session. The app sends accessToken as "Authorization: Bearer ..." and trades refreshToken
 * for a new session (POST /api/auth/refresh) before expiresAt (seconds since the epoch).
 */
public record AuthResponse(String accessToken, String refreshToken, long expiresAt, ProfileResponse profile) {
}
