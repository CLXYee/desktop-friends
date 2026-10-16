package com.desktopfriends.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.desktopfriends.backend.support.IntegrationTestSupport;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Accounts: sign up, log in, refresh, log out, and who gets in")
class AuthControllerIntegrationTest extends IntegrationTestSupport {

    private ResultActions postJson(String url, Map<String, ?> body) throws Exception {
        return mockMvc.perform(post(url).contentType(MediaType.APPLICATION_JSON).content(json(body)));
    }

    @Nested
    @DisplayName("sign up")
    class SignUp {

        @Test
        void createsTheAccountAndItsProfileAndSignsIn() throws Exception {
            postJson("/api/auth/signup", Map.of("username", "  Friend_Amy ", "displayName", "  Amy ", "password", PASSWORD))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.accessToken").isNotEmpty())
                    .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                    .andExpect(jsonPath("$.expiresAt").isNumber())
                    .andExpect(jsonPath("$.profile.username").value("friend_amy"))
                    .andExpect(jsonPath("$.profile.displayName").value("Amy"))
                    .andExpect(jsonPath("$.profile.role").value("user"));

            TestUser amy = new TestUser(null, "friend_amy", "Amy",
                    read(postJson("/api/auth/login", Map.of("username", "friend_amy", "password", PASSWORD)), "$.accessToken"), null);
            getAs(amy, "/api/profiles/me")
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.username").value("friend_amy"))
                    .andExpect(jsonPath("$.displayName").value("Amy"));
        }

        @Test
        void rejectsATakenUsername() throws Exception {
            signUp("friend_amy", "Amy");
            postJson("/api/auth/signup", Map.of("username", "friend_amy", "displayName", "Other", "password", PASSWORD))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.status").value(409))
                    .andExpect(jsonPath("$.error").value("That username is already taken. Try another one."));
        }

        @Test
        void checksTheUsernameNameAndPasswordRules() throws Exception {
            postJson("/api/auth/signup", Map.of("username", "ab", "displayName", "Amy", "password", PASSWORD))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Usernames are 3–20 lowercase letters, numbers or underscores."));
            postJson("/api/auth/signup", Map.of("username", "has space", "displayName", "Amy", "password", PASSWORD))
                    .andExpect(status().isBadRequest());
            postJson("/api/auth/signup", Map.of("username", "friend_amy", "displayName", "Amy", "password", "weakpass"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Use at least 8 characters with upper and lower case letters, a number and a symbol."));
            postJson("/api/auth/signup", Map.of("username", "friend_amy", "displayName", "   ", "password", PASSWORD))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Enter a name of 1–40 characters."));
            postJson("/api/auth/signup", Map.of("username", "friend_amy", "displayName", "x".repeat(41), "password", PASSWORD))
                    .andExpect(status().isBadRequest());
            postJson("/api/auth/signup", Map.of("username", "friend_amy"))
                    .andExpect(status().isBadRequest());
            mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content("not json"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("The request isn't in the expected format."));
        }
    }

    @Nested
    @DisplayName("log in")
    class LogIn {

        @Test
        void acceptsTheUsernameInAnyCase() throws Exception {
            signUp("friend_amy", "Amy");
            postJson("/api/auth/login", Map.of("username", " FRIEND_AMY ", "password", PASSWORD))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.profile.username").value("friend_amy"));
        }

        @Test
        void refusesWrongPasswordsAndUnknownUsers() throws Exception {
            signUp("friend_amy", "Amy");
            postJson("/api/auth/login", Map.of("username", "friend_amy", "password", "Wrong#2026"))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value("Wrong username or password."));
            postJson("/api/auth/login", Map.of("username", "nobody_here", "password", PASSWORD))
                    .andExpect(status().isUnauthorized());
            postJson("/api/auth/login", Map.of("username", "", "password", ""))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.error").value("Enter your username and password."));
        }
    }

    @Nested
    @DisplayName("refresh and log out")
    class Sessions {

        @Test
        void tradesARefreshTokenForANewSessionOnlyOnce() throws Exception {
            TestUser amy = signUp("friend_amy", "Amy");
            ResultActions refreshed = postJson("/api/auth/refresh", Map.of("refreshToken", amy.refreshToken()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.profile.username").value("friend_amy"));
            assertThat((String) read(refreshed, "$.refreshToken")).isNotEqualTo(amy.refreshToken());

            postJson("/api/auth/refresh", Map.of("refreshToken", amy.refreshToken()))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.error").value("Your session ended. Log in again."));
        }

        @Test
        void logOutMarksTheUserOfflineAndEndsTheSupabaseSession() throws Exception {
            TestUser amy = signUp("friend_amy", "Amy");
            TestUser ben = signUp("friend_ben", "Ben");
            postAs(amy, "/api/friends/requests", Map.of("username", "friend_ben"));
            String requestId = read(getAs(ben, "/api/friends"), "$.incoming[0].id");
            postAs(ben, "/api/friends/requests/" + requestId + "/accept").andExpect(status().isNoContent());
            putAs(amy, "/api/presence", Map.of("status", "online")).andExpect(status().isNoContent());
            getAs(ben, "/api/friends").andExpect(jsonPath("$.friends[0].friend.presence").value("online"));

            postAs(amy, "/api/auth/logout").andExpect(status().isNoContent());

            getAs(ben, "/api/friends").andExpect(jsonPath("$.friends[0].friend.presence").value("offline"));
            assertThat(AUTH.signOutCalls()).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("access tokens")
    class AccessTokens {

        @Test
        void healthIsPublicEverythingElseNeedsAToken() throws Exception {
            mockMvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
            for (String url : List.of("/api/profiles/me", "/api/friends", "/api/groups", "/api/group-invitations")) {
                mockMvc.perform(get(url))
                        .andExpect(status().isUnauthorized())
                        .andExpect(header().string("WWW-Authenticate", "Bearer"))
                        .andExpect(jsonPath("$.error").value("Your session ended. Log in again."));
            }
        }

        @Test
        void refusesTokensThisProjectDidNotIssueForASignedInUser() throws Exception {
            TestUser amy = signUp("friend_amy", "Amy");
            List<String> rejected = List.of(
                    "not-a-jwt",
                    AUTH.mintTokenWithUnknownKey(amy.id()),
                    AUTH.mintToken(amy.id(), claims -> claims.issuer("https://another-project.supabase.co/auth/v1")),
                    AUTH.mintToken(amy.id(), claims -> claims.expirationTime(Date.from(Instant.now().minusSeconds(600)))),
                    AUTH.mintToken(amy.id(), claims -> claims.claim("role", "anon")),
                    AUTH.mintToken(amy.id(), claims -> claims.audience("somebody-else")),
                    AUTH.mintToken(amy.id(), claims -> claims.subject("not-a-uuid")));
            for (String token : rejected) {
                mockMvc.perform(get("/api/profiles/me").header("Authorization", "Bearer " + token))
                        .andExpect(status().isUnauthorized());
            }
            mockMvc.perform(get("/api/profiles/me").header("Authorization", "Bearer " + AUTH.mintToken(amy.id(), claims -> { })))
                    .andExpect(status().isOk());
        }

        @Test
        void unknownAddressesAnswerInTheUsualErrorFormat() throws Exception {
            TestUser amy = signUp("friend_amy", "Amy");
            getAs(amy, "/api/nothing-here").andExpect(status().isNotFound()).andExpect(jsonPath("$.status").value(404));
        }
    }
}
