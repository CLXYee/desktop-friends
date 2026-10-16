package com.desktopfriends.backend.config;

import jakarta.validation.constraints.NotBlank;
import java.net.URI;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * The Supabase project: its URL and publishable key (used to call Supabase Auth on the user's behalf).
 * The database connection itself is configured under spring.datasource.
 */
@Validated
@ConfigurationProperties(prefix = "app.supabase")
public record SupabaseProperties(@NotBlank String url, @NotBlank String publishableKey) {

    public String authUrl() {
        return url.replaceAll("/+$", "") + "/auth/v1";
    }

    /** Who issues the access tokens the app sends us. */
    public String jwtIssuer() {
        return authUrl();
    }

    public String jwkSetUri() {
        return authUrl() + "/.well-known/jwks.json";
    }

    /**
     * Supabase Auth identifies accounts by email, but Desktop Friends signs people in by username, so each
     * username maps to an internal address on the project's own domain. No mail is ever sent to it.
     */
    public String accountEmailDomain() {
        return URI.create(url).getHost();
    }
}
