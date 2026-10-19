package com.desktopfriends.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.desktopfriends.backend.support.IntegrationTestSupport;
import java.time.Duration;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Direct messages: one chat per pair of friends, friends only, private to the two of them")
class DirectMessageIntegrationTest extends IntegrationTestSupport {

    private TestUser amy;
    private TestUser ben;
    private TestUser cleo;

    @BeforeEach
    void amyAndBenAreFriends() throws Exception {
        amy = signUp("friend_amy", "Amy");
        ben = signUp("friend_ben", "Ben");
        cleo = signUp("friend_cleo", "Cleo");
        befriend(amy, ben);
    }

    private String openChat(TestUser user, TestUser friend) throws Exception {
        return read(postAs(user, "/api/conversations/direct", Map.of("friendId", friend.id())).andExpect(status().isOk()), "$.id");
    }

    private void send(TestUser user, String chatId, String body) throws Exception {
        postAs(user, "/api/conversations/" + chatId + "/messages", Map.of("body", body)).andExpect(status().isCreated());
    }

    @Test
    void thereIsOneChatPerPairWhoeverOpensIt() throws Exception {
        putAs(ben, "/api/presence", Map.of("status", "online"));
        putAs(ben, "/api/profiles/me", Map.of("characterId", "clover"));
        String chatId = openChat(amy, ben);
        assertThat(openChat(amy, ben)).isEqualTo(chatId);
        assertThat(openChat(ben, amy)).isEqualTo(chatId);

        postAs(amy, "/api/conversations/direct", Map.of("friendId", ben.id()))
                .andExpect(jsonPath("$.kind").value("direct"))
                .andExpect(jsonPath("$.title").value("Ben"))
                .andExpect(jsonPath("$.characterId").value("clover"))
                .andExpect(jsonPath("$.partner.username").value("friend_ben"))
                .andExpect(jsonPath("$.partner.presence").value("online"))
                .andExpect(jsonPath("$.canSend").value(true))
                .andExpect(jsonPath("$.group").doesNotExist());
        getAs(ben, "/api/conversations").andExpect(jsonPath("$[0].title").value("Amy"));

        // The database itself refuses a second chat for the pair, in either order.
        assertThatThrownBy(() -> DATABASE.execute(
                "insert into conversations (kind, direct_user_a, direct_user_b) values ('direct', '" + ben.id() + "', '" + amy.id() + "')"))
                .hasStackTraceContaining("conversations_direct_pair_key");
    }

    @Test
    void onlyFriendsCanStartAChat() throws Exception {
        postAs(amy, "/api/conversations/direct", Map.of("friendId", cleo.id()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("You can only message your friends."));
        postAs(amy, "/api/conversations/direct", Map.of("friendId", amy.id()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("That's you! Pick a friend to message."));
        postAs(amy, "/api/conversations/direct", Map.of()).andExpect(status().isBadRequest());
    }

    @Test
    void theTwoOfThemChatAndNobodyElseCanRead() throws Exception {
        String chatId = openChat(amy, ben);
        send(amy, chatId, "Hey, coffee later?");
        clock.advance(Duration.ofSeconds(1));
        send(ben, chatId, "Sure, 3pm");
        getAs(ben, "/api/conversations/" + chatId + "/messages")
                .andExpect(jsonPath("$.messages.length()").value(2))
                .andExpect(jsonPath("$.messages[0].sender.displayName").value("Amy"))
                .andExpect(jsonPath("$.messages[1].body").value("Sure, 3pm"));
        getAs(amy, "/api/conversations")
                .andExpect(jsonPath("$[0].unreadCount").value(1))
                .andExpect(jsonPath("$[0].lastMessage.body").value("Sure, 3pm"));

        befriend(cleo, amy);
        getAs(cleo, "/api/conversations/" + chatId + "/messages").andExpect(status().isNotFound());
        postAs(cleo, "/api/conversations/" + chatId + "/messages", Map.of("body", "hi")).andExpect(status().isNotFound());
        // Cleo has her own chat with Amy.
        String cleoChat = openChat(cleo, amy);
        assertThat(cleoChat).isNotEqualTo(chatId);
        getAs(amy, "/api/conversations").andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void unfriendingStopsNewMessagesButKeepsTheHistory() throws Exception {
        String chatId = openChat(amy, ben);
        send(amy, chatId, "Before");
        putAs(ben, "/api/presence", Map.of("status", "online"));
        deleteAs(ben, "/api/friends/" + amy.id()).andExpect(status().isNoContent());

        postAs(amy, "/api/conversations/" + chatId + "/messages", Map.of("body", "Are you there?"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("You can only message friends. Add them again to keep chatting."));
        getAs(amy, "/api/conversations/" + chatId + "/messages").andExpect(jsonPath("$.messages[0].body").value("Before"));
        getAs(amy, "/api/conversations")
                .andExpect(jsonPath("$[0].canSend").value(false))
                // No longer friends: their status is hidden again.
                .andExpect(jsonPath("$[0].partner.presence").value("offline"));
        postAs(amy, "/api/conversations/direct", Map.of("friendId", ben.id())).andExpect(status().isBadRequest());

        // Friends again: the same chat carries on.
        befriend(amy, ben);
        assertThat(openChat(amy, ben)).isEqualTo(chatId);
        send(amy, chatId, "After");
        getAs(ben, "/api/conversations/" + chatId + "/messages").andExpect(jsonPath("$.messages[1].body").value("After"));
    }

    @Test
    void theCharacterYouPickIsYourAvatar() throws Exception {
        putAs(amy, "/api/profiles/me", Map.of("characterId", "lovie"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.characterId").value("lovie"));
        getAs(amy, "/api/profiles/me").andExpect(jsonPath("$.characterId").value("lovie"));
        getAs(ben, "/api/friends").andExpect(jsonPath("$.friends[0].friend.characterId").value("lovie"));
        putAs(amy, "/api/profiles/me", Map.of("characterId", "dragon"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Unknown character. Pick one of crystal, lovie, cloudy, starry, clover."));
        // New accounts start with Crystal.
        getAs(cleo, "/api/profiles/me").andExpect(jsonPath("$.characterId").value("crystal"));
    }
}
