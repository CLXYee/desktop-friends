package com.desktopfriends.backend.service;

import com.desktopfriends.backend.client.SupabaseAuthClient;
import com.desktopfriends.backend.client.SupabaseAuthException;
import com.desktopfriends.backend.client.SupabaseSession;
import com.desktopfriends.backend.config.SupabaseProperties;
import com.desktopfriends.backend.dto.request.LoginRequest;
import com.desktopfriends.backend.dto.request.SignUpRequest;
import com.desktopfriends.backend.dto.response.AuthResponse;
import com.desktopfriends.backend.entity.PresenceStatus;
import com.desktopfriends.backend.exception.AuthenticationFailedException;
import com.desktopfriends.backend.exception.BadRequestException;
import com.desktopfriends.backend.util.AccountRules;
import java.time.Clock;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Accounts, through Supabase Auth. People sign in with a username; Supabase identifies accounts by email,
 * so each username maps to an internal address on the project's domain (no mail is ever sent to it).
 */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private final SupabaseAuthClient supabaseAuthClient;
    private final SupabaseProperties supabaseProperties;
    private final ProfileService profileService;
    private final PresenceService presenceService;
    private final Clock clock;

    public AuthService(SupabaseAuthClient supabaseAuthClient, SupabaseProperties supabaseProperties,
            ProfileService profileService, PresenceService presenceService, Clock clock) {
        this.supabaseAuthClient = supabaseAuthClient;
        this.supabaseProperties = supabaseProperties;
        this.profileService = profileService;
        this.presenceService = presenceService;
        this.clock = clock;
    }

    public AuthResponse signUp(SignUpRequest request) {
        String displayName = request.displayName().strip();
        if (displayName.isEmpty() || displayName.codePointCount(0, displayName.length()) > AccountRules.DISPLAY_NAME_MAX) {
            throw new BadRequestException("Enter a name of 1–" + AccountRules.DISPLAY_NAME_MAX + " characters.");
        }
        if (!AccountRules.isValidUsername(request.username())) {
            throw new BadRequestException("Usernames are 3–20 lowercase letters, numbers or underscores.");
        }
        if (!AccountRules.isStrongPassword(request.password())) {
            throw new BadRequestException("Use at least 8 characters with upper and lower case letters, a number and a symbol.");
        }
        String username = AccountRules.normalizeUsername(request.username());
        SupabaseSession session = callSupabase(() -> supabaseAuthClient.signUp(
                toAccountEmail(username), request.password(), Map.of("display_name", displayName, "username", username)));
        if (!session.hasSession()) {
            throw new AuthenticationFailedException(HttpStatus.FORBIDDEN,
                    "Account created, but Supabase wants it confirmed by email first. Turn off \"Confirm email\" in Supabase "
                            + "(Authentication → Sign In / Providers → Email), then log in.");
        }
        return toAuthResponse(session);
    }

    public AuthResponse logIn(LoginRequest request) {
        String username = AccountRules.normalizeUsername(request.username());
        return toAuthResponse(callSupabase(() -> supabaseAuthClient.signInWithPassword(toAccountEmail(username), request.password())));
    }

    public AuthResponse refresh(String refreshToken) {
        return toAuthResponse(callSupabase(() -> supabaseAuthClient.refreshSession(refreshToken)));
    }

    /** Marks the user offline, then ends the session with Supabase (a failure there doesn't block logging out). */
    public void logOut(UUID userId, String accessToken) {
        presenceService.updateStatus(userId, PresenceStatus.OFFLINE);
        try {
            supabaseAuthClient.signOut(accessToken);
        } catch (SupabaseAuthException exception) {
            log.info("Supabase didn't end the session ({}); the app forgets it anyway", exception.getErrorCode());
        }
    }

    String toAccountEmail(String username) {
        return username + "@" + supabaseProperties.accountEmailDomain();
    }

    private AuthResponse toAuthResponse(SupabaseSession session) {
        if (!session.hasSession() || session.user() == null) {
            throw new AuthenticationFailedException(HttpStatus.BAD_GATEWAY, "The account service sent an unexpected reply. Try again.");
        }
        long expiresAt = session.expiresAt() != null
                ? session.expiresAt()
                : clock.instant().getEpochSecond() + (session.expiresIn() == null ? 3600 : session.expiresIn());
        return new AuthResponse(session.accessToken(), session.refreshToken(), expiresAt,
                profileService.getProfile(UUID.fromString(session.user().id())));
    }

    private static SupabaseSession callSupabase(Supplier<SupabaseSession> request) {
        try {
            return request.get();
        } catch (SupabaseAuthException exception) {
            throw describe(exception);
        }
    }

    /** Turns Supabase Auth errors into messages for people, not developers. */
    static AuthenticationFailedException describe(SupabaseAuthException exception) {
        if (exception.isUnreachable()) {
            return new AuthenticationFailedException(HttpStatus.SERVICE_UNAVAILABLE, "Can't reach the account service. Try again in a moment.");
        }
        return switch (exception.getErrorCode()) {
            case "invalid_credentials", "invalid_grant" -> new AuthenticationFailedException(HttpStatus.UNAUTHORIZED, "Wrong username or password.");
            case "user_already_exists", "email_exists" -> new AuthenticationFailedException(HttpStatus.CONFLICT, "That username is already taken. Try another one.");
            case "weak_password" -> new AuthenticationFailedException(HttpStatus.BAD_REQUEST,
                    "That password is too weak. Use at least 8 characters with upper and lower case, a number and a symbol.");
            case "email_not_confirmed" -> new AuthenticationFailedException(HttpStatus.FORBIDDEN,
                    "This account still needs confirming. Turn off \"Confirm email\" in Supabase (Authentication → Sign In / Providers → Email).");
            case "over_request_rate_limit", "over_email_send_rate_limit" -> new AuthenticationFailedException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many attempts. Please wait a minute and try again.");
            case "signup_disabled" -> new AuthenticationFailedException(HttpStatus.FORBIDDEN, "New sign-ups are turned off for this app.");
            case "refresh_token_not_found", "refresh_token_already_used", "session_not_found", "session_expired" ->
                    new AuthenticationFailedException(HttpStatus.UNAUTHORIZED, "Your session ended. Log in again.");
            default -> exception.getMessage() != null && exception.getMessage().toLowerCase().contains("database error saving new user")
                    ? new AuthenticationFailedException(HttpStatus.BAD_REQUEST, "That username can't be used. Pick 3–20 lowercase letters, numbers or underscores.")
                    : new AuthenticationFailedException(exception.getStatus() >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST,
                            exception.getMessage() == null || exception.getMessage().isBlank() ? "The account service refused the request." : exception.getMessage());
        };
    }
}
