package com.desktopfriends.backend.client;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A session as Supabase Auth returns it. When sign-up needs email confirmation it returns only the user,
 * so accessToken is null.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SupabaseSession(
        @JsonProperty("access_token") String accessToken,
        @JsonProperty("refresh_token") String refreshToken,
        @JsonProperty("expires_at") Long expiresAt,
        @JsonProperty("expires_in") Long expiresIn,
        SupabaseUser user) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SupabaseUser(String id, String email) {
    }

    public boolean hasSession() {
        return accessToken != null && !accessToken.isBlank();
    }
}
