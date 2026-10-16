package com.desktopfriends.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.desktopfriends.backend.support.IntegrationTestSupport;
import java.util.Map;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Friends: requests, accepting, declining, cancelling, unfriending, and who sees whom")
class FriendshipControllerIntegrationTest extends IntegrationTestSupport {

    private TestUser amy;
    private TestUser ben;
    private TestUser cleo;

    @BeforeEach
    void signUpThreeFriends() throws Exception {
        amy = signUp("friend_amy", "Amy");
        ben = signUp("friend_ben", "Ben");
        cleo = signUp("friend_cleo", "Cleo");
    }

    private String sendRequest(TestUser from, String username) throws Exception {
        return read(postAs(from, "/api/friends/requests", Map.of("username", username)).andExpect(status().isCreated()), "$.status");
    }

    private String incomingRequestId(TestUser to) throws Exception {
        return read(getAs(to, "/api/friends"), "$.incoming[0].id");
    }

    private void makeFriends(TestUser first, TestUser second) throws Exception {
        sendRequest(first, second.username());
        postAs(second, "/api/friends/requests/" + incomingRequestId(second) + "/accept").andExpect(status().isNoContent());
    }

    @Test
    void startsWithNoFriends() throws Exception {
        getAs(amy, "/api/friends")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.friends").isEmpty())
                .andExpect(jsonPath("$.incoming").isEmpty())
                .andExpect(jsonPath("$.outgoing").isEmpty());
    }

    @Test
    void aRequestOnlyRevealsTheRequesterToThePersonAsked() throws Exception {
        putAs(ben, "/api/presence", Map.of("status", "online"));

        assertThat(sendRequest(amy, "  Friend_Ben ")).isEqualTo("pending");

        // Amy sees whom she asked, but not Ben's status.
        getAs(amy, "/api/friends")
                .andExpect(jsonPath("$.outgoing[0].kind").value("outgoing"))
                .andExpect(jsonPath("$.outgoing[0].friend.username").value("friend_ben"))
                .andExpect(jsonPath("$.outgoing[0].friend.displayName").value("Ben"))
                .andExpect(jsonPath("$.outgoing[0].friend.presence").value("offline"))
                .andExpect(jsonPath("$.outgoing[0].friend.lastSeenAt").value(Matchers.nullValue()))
                .andExpect(jsonPath("$.friends").isEmpty());
        // Ben sees who asked him.
        getAs(ben, "/api/friends")
                .andExpect(jsonPath("$.incoming[0].kind").value("incoming"))
                .andExpect(jsonPath("$.incoming[0].friend.username").value("friend_amy"))
                .andExpect(jsonPath("$.incoming[0].friend.displayName").value("Amy"));
        // Cleo sees nothing of it.
        getAs(cleo, "/api/friends")
                .andExpect(jsonPath("$.friends").isEmpty())
                .andExpect(jsonPath("$.incoming").isEmpty())
                .andExpect(jsonPath("$.outgoing").isEmpty());
    }

    @Test
    void explainsRequestsThatCannotBeSent() throws Exception {
        sendRequest(amy, "friend_ben");
        postAs(amy, "/api/friends/requests", Map.of("username", "friend_ben"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("You already sent them a request."));
        postAs(amy, "/api/friends/requests", Map.of("username", "friend_amy"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("That's you! Add someone else."));
        postAs(amy, "/api/friends/requests", Map.of("username", "nobody_here_123"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("No one has the username \"nobody_here_123\"."));
        postAs(amy, "/api/friends/requests", Map.of("username", "  "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Enter their username."));
    }

    @Test
    void onlyThePersonAskedCanAcceptAndThenBothAreFriends() throws Exception {
        sendRequest(amy, "friend_ben");
        String requestId = incomingRequestId(ben);

        postAs(cleo, "/api/friends/requests/" + requestId + "/accept")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("That friend request is no longer waiting for you."));
        postAs(amy, "/api/friends/requests/" + requestId + "/accept").andExpect(status().isNotFound());

        postAs(ben, "/api/friends/requests/" + requestId + "/accept").andExpect(status().isNoContent());

        getAs(amy, "/api/friends")
                .andExpect(jsonPath("$.friends[0].kind").value("friend"))
                .andExpect(jsonPath("$.friends[0].friend.username").value("friend_ben"))
                .andExpect(jsonPath("$.outgoing").isEmpty());
        getAs(ben, "/api/friends")
                .andExpect(jsonPath("$.friends[0].friend.username").value("friend_amy"))
                .andExpect(jsonPath("$.incoming").isEmpty());
        postAs(ben, "/api/friends/requests", Map.of("username", "friend_amy"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("You are already friends."));
        postAs(ben, "/api/friends/requests/" + requestId + "/accept").andExpect(status().isNotFound());
    }

    @Test
    void askingSomeoneWhoAlreadyAskedYouAcceptsTheirRequest() throws Exception {
        assertThat(sendRequest(cleo, "friend_amy")).isEqualTo("pending");
        assertThat(sendRequest(amy, "friend_cleo")).isEqualTo("accepted");
        getAs(cleo, "/api/friends").andExpect(jsonPath("$.friends[0].friend.username").value("friend_amy"));
        getAs(amy, "/api/friends").andExpect(jsonPath("$.incoming").isEmpty());
    }

    @Test
    void decliningDeletesTheRequest() throws Exception {
        sendRequest(cleo, "friend_ben");
        postAs(ben, "/api/friends/requests/" + incomingRequestId(ben) + "/decline").andExpect(status().isNoContent());
        getAs(cleo, "/api/friends").andExpect(jsonPath("$.outgoing").isEmpty());
        getAs(ben, "/api/friends").andExpect(jsonPath("$.incoming").isEmpty());
        // Declined people may ask again.
        assertThat(sendRequest(cleo, "friend_ben")).isEqualTo("pending");
    }

    @Test
    void theRequesterCanCancelButThePersonAskedMustDecline() throws Exception {
        sendRequest(cleo, "friend_ben");
        deleteAs(ben, "/api/friends/" + cleo.id())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("You are not friends with them."));
        deleteAs(cleo, "/api/friends/" + ben.id()).andExpect(status().isNoContent());
        getAs(ben, "/api/friends").andExpect(jsonPath("$.incoming").isEmpty());
    }

    @Test
    void eitherFriendCanUnfriendAndTheFriendshipIsGoneForBoth() throws Exception {
        makeFriends(amy, cleo);
        deleteAs(cleo, "/api/friends/" + amy.id()).andExpect(status().isNoContent());
        getAs(amy, "/api/friends").andExpect(jsonPath("$.friends").isEmpty());
        deleteAs(cleo, "/api/friends/" + amy.id()).andExpect(status().isNotFound());
        deleteAs(amy, "/api/friends/" + ben.id()).andExpect(status().isNotFound());
    }

    @Test
    void friendsSeeEachOthersStatusButOthersDont() throws Exception {
        makeFriends(amy, ben);
        putAs(ben, "/api/presence", Map.of("status", "idle"));
        getAs(amy, "/api/friends")
                .andExpect(jsonPath("$.friends[0].friend.presence").value("idle"))
                .andExpect(jsonPath("$.friends[0].friend.lastSeenAt").isNotEmpty());
        getAs(cleo, "/api/friends").andExpect(jsonPath("$.friends").isEmpty());
    }

    @Test
    void rejectsMalformedIds() throws Exception {
        postAs(amy, "/api/friends/requests/not-a-uuid/accept")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("The request isn't in the expected format."));
        deleteAs(amy, "/api/friends/not-a-uuid").andExpect(status().isBadRequest());
    }
}
