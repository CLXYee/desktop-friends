package com.desktopfriends.backend.controller;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.desktopfriends.backend.support.IntegrationTestSupport;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Online status: online, idle, offline, heartbeats going stale, and who sees it")
class PresenceControllerIntegrationTest extends IntegrationTestSupport {

    private TestUser amy;
    private TestUser ben;

    @BeforeEach
    void signUpTwoFriends() throws Exception {
        amy = signUp("friend_amy", "Amy");
        ben = signUp("friend_ben", "Ben");
        postAs(amy, "/api/friends/requests", Map.of("username", "friend_ben"));
        postAs(ben, "/api/friends/requests/" + read(getAs(ben, "/api/friends"), "$.incoming[0].id") + "/accept");
    }

    private String bensPresenceForAmy() throws Exception {
        return read(getAs(amy, "/api/friends"), "$.friends[0].friend.presence");
    }

    @Test
    void aNewAccountIsOffline() throws Exception {
        org.assertj.core.api.Assertions.assertThat(bensPresenceForAmy()).isEqualTo("offline");
    }

    @Test
    void friendsSeeOnlineIdleAndOffline() throws Exception {
        putAs(ben, "/api/presence", Map.of("status", "online")).andExpect(status().isNoContent());
        getAs(amy, "/api/friends")
                .andExpect(jsonPath("$.friends[0].friend.presence").value("online"))
                .andExpect(jsonPath("$.friends[0].friend.lastSeenAt").isNotEmpty());

        putAs(ben, "/api/presence", Map.of("status", "idle")).andExpect(status().isNoContent());
        getAs(amy, "/api/friends").andExpect(jsonPath("$.friends[0].friend.presence").value("idle"));

        putAs(ben, "/api/presence", Map.of("status", "offline")).andExpect(status().isNoContent());
        getAs(amy, "/api/friends").andExpect(jsonPath("$.friends[0].friend.presence").value("offline"));
    }

    @Test
    void aStatusThatIsNoLongerReportedTurnsOfflineAfterThreeMinutes() throws Exception {
        putAs(ben, "/api/presence", Map.of("status", "online"));
        clock.advance(Duration.ofMinutes(2).plusSeconds(50));
        getAs(amy, "/api/friends").andExpect(jsonPath("$.friends[0].friend.presence").value("online"));

        clock.advance(Duration.ofSeconds(20));
        getAs(amy, "/api/friends").andExpect(jsonPath("$.friends[0].friend.presence").value("offline"));

        // The next heartbeat brings him back.
        putAs(ben, "/api/presence", Map.of("status", "online"));
        getAs(amy, "/api/friends").andExpect(jsonPath("$.friends[0].friend.presence").value("online"));
    }

    @Test
    void rejectsUnknownStatuses() throws Exception {
        putAs(ben, "/api/presence", Map.of("status", "busy"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Unknown status. Use online, idle or offline."));
        Map<String, Object> missing = new HashMap<>();
        missing.put("status", null);
        putAs(ben, "/api/presence", missing).andExpect(status().isBadRequest());
    }
}
