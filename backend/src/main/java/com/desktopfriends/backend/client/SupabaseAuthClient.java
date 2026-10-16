package com.desktopfriends.backend.client;

import com.desktopfriends.backend.config.SupabaseProperties;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** Calls Supabase Auth (GoTrue) with the project's publishable key: sign up, log in, refresh, log out. */
@Component
public class SupabaseAuthClient {

    private final RestClient restClient;

    public SupabaseAuthClient(RestClient.Builder restClientBuilder, SupabaseProperties supabaseProperties) {
        this.restClient = restClientBuilder
                .baseUrl(supabaseProperties.authUrl())
                .defaultHeader("apikey", supabaseProperties.publishableKey())
                .build();
    }

    /** Creates an account; metadata ends up in raw_user_meta_data (the profile trigger reads display_name). */
    public SupabaseSession signUp(String email, String password, Map<String, Object> metadata) {
        return call(() -> restClient.post()
                .uri("/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("email", email, "password", password, "data", metadata))
                .retrieve()
                .body(SupabaseSession.class));
    }

    public SupabaseSession signInWithPassword(String email, String password) {
        return call(() -> restClient.post()
                .uri("/token?grant_type=password")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("email", email, "password", password))
                .retrieve()
                .body(SupabaseSession.class));
    }

    public SupabaseSession refreshSession(String refreshToken) {
        return call(() -> restClient.post()
                .uri("/token?grant_type=refresh_token")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("refresh_token", refreshToken))
                .retrieve()
                .body(SupabaseSession.class));
    }

    /** Ends this session (only this device's, like the app's "Log out"). */
    public void signOut(String accessToken) {
        call(() -> restClient.post()
                .uri("/logout?scope=local")
                .header("Authorization", "Bearer " + accessToken)
                .retrieve()
                .toBodilessEntity());
    }

    private <T> T call(Supplier<T> request) {
        try {
            return request.get();
        } catch (RestClientResponseException exception) {
            AuthError error = readError(exception);
            String code = firstNonBlank(error.errorCode(), error.error(), "unknown");
            String message = firstNonBlank(error.msg(), error.message(), error.errorDescription(), exception.getStatusText());
            throw new SupabaseAuthException(exception.getStatusCode().value(), code, message);
        } catch (ResourceAccessException exception) {
            throw new SupabaseAuthException(0, "unreachable", exception.getMessage());
        }
    }

    private static AuthError readError(RestClientResponseException exception) {
        try {
            AuthError error = exception.getResponseBodyAs(AuthError.class);
            return error == null ? AuthError.EMPTY : error;
        } catch (RuntimeException unreadable) {
            return AuthError.EMPTY;
        }
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "";
    }

    /** Supabase Auth's error body (newer versions use error_code/msg, older ones error/error_description). */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record AuthError(
            @JsonProperty("error_code") String errorCode,
            String msg,
            String message,
            String error,
            @JsonProperty("error_description") String errorDescription) {

        static final AuthError EMPTY = new AuthError(null, null, null, null, null);
    }
}
