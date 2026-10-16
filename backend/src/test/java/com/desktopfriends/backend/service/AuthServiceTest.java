package com.desktopfriends.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.desktopfriends.backend.client.SupabaseAuthException;
import com.desktopfriends.backend.exception.AuthenticationFailedException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

/** Supabase Auth errors become messages for people, with a fitting status. */
class AuthServiceTest {

    private static AuthenticationFailedException describe(int status, String code, String message) {
        return AuthService.describe(new SupabaseAuthException(status, code, message));
    }

    @Test
    void mapsTheErrorsPeopleRunInto() {
        assertThat(describe(400, "invalid_credentials", "Invalid login credentials"))
                .hasMessage("Wrong username or password.")
                .extracting(AuthenticationFailedException::getStatus).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(describe(422, "user_already_exists", "User already registered"))
                .hasMessage("That username is already taken. Try another one.")
                .extracting(AuthenticationFailedException::getStatus).isEqualTo(HttpStatus.CONFLICT);
        assertThat(describe(429, "over_request_rate_limit", "rate limited").getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(describe(400, "refresh_token_already_used", "used")).hasMessage("Your session ended. Log in again.");
        assertThat(describe(400, "email_not_confirmed", "no").getMessage()).contains("Confirm email");
        assertThat(describe(422, "weak_password", "weak").getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void explainsWhenTheAccountServiceCantBeReached() {
        assertThat(describe(0, "unreachable", "Connection refused"))
                .hasMessage("Can't reach the account service. Try again in a moment.")
                .extracting(AuthenticationFailedException::getStatus).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Test
    void reportsUsernamesTheDatabaseRefused() {
        assertThat(describe(500, "unexpected_failure", "Database error saving new user"))
                .hasMessage("That username can't be used. Pick 3–20 lowercase letters, numbers or underscores.");
        assertThat(describe(503, "something_new", "Upstream down").getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY);
    }
}
