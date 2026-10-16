package com.desktopfriends.backend.security;

import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtValidators;

/**
 * Which Supabase access tokens the API accepts: not expired, issued by this project's Supabase Auth, for
 * signed-in users (audience and role "authenticated", which rules out the anon key), with a user id.
 */
public final class SupabaseJwtValidators {

    public static final String AUDIENCE = "authenticated";

    private SupabaseJwtValidators() {
    }

    public static OAuth2TokenValidator<Jwt> create(String issuer) {
        return new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer),
                new JwtClaimValidator<List<String>>(JwtClaimNames.AUD, audience -> audience != null && audience.contains(AUDIENCE)),
                new JwtClaimValidator<String>("role", AUDIENCE::equals),
                new JwtClaimValidator<String>(JwtClaimNames.SUB, SupabaseJwtValidators::isUuid));
    }

    private static boolean isUuid(String value) {
        try {
            UUID.fromString(value);
            return true;
        } catch (RuntimeException notUuid) {
            return false;
        }
    }
}
