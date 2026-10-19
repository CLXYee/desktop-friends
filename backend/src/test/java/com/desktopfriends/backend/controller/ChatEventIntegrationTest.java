package com.desktopfriends.backend.controller;

import static com.desktopfriends.backend.support.EventStreamClient.named;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.desktopfriends.backend.support.EventStreamClient;
import com.desktopfriends.backend.support.EventStreamClient.StreamEvent;
import com.desktopfriends.backend.support.IntegrationTestSupport;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.web.server.LocalServerPort;

/** Live chat updates over real HTTP: messages, edits and typing reach the chat's members and nobody else. */
@DisplayName("Live chat: messages, updates and typing reach exactly the chat's members")
class ChatEventIntegrationTest extends IntegrationTestSupport {

    @LocalServerPort
    private int port;

    private TestUser amy;
    private TestUser ben;
    private TestUser cleo;

    @BeforeEach
    void threeFriendsOfAmy() throws Exception {
        amy = signUp("friend_amy", "Amy");
        ben = signUp("friend_ben", "Ben");
        cleo = signUp("friend_cleo", "Cleo");
        befriend(amy, ben);
        befriend(amy, cleo);
    }

    private static void settle() throws InterruptedException {
        Thread.sleep(500);
    }

    @Test
    void aDirectMessageReachesBothPeopleOnly() throws Exception {
        String chatId = read(postAs(amy, "/api/conversations/direct", Map.of("friendId", ben.id())), "$.id");
        try (EventStreamClient amyStream = EventStreamClient.open(port, amy.accessToken());
                EventStreamClient benStream = EventStreamClient.open(port, ben.accessToken());
                EventStreamClient cleoStream = EventStreamClient.open(port, cleo.accessToken())) {
            postAs(amy, "/api/conversations/" + chatId + "/messages", Map.of("body", "Psst, Ben")).andExpect(status().isCreated());

            StreamEvent received = benStream.await(named("message"), "Ben to get Amy's message");
            assertThat(received.data()).contains("Psst, Ben").contains(chatId).contains("\"displayName\":\"Amy\"");
            amyStream.await(named("message"), "Amy's other windows to get it too");
            settle();
            assertThat(cleoStream.events()).extracting(StreamEvent::name).containsExactly("ready");
        }
    }

    @Test
    void typingIsShownToTheOthersInTheChatAndNeverStored() throws Exception {
        String groupId = read(postAs(amy, "/api/groups", Map.of("name", "Study Buddies")), "$.id");
        String chatId = read(getAs(amy, "/api/groups"), "$[0].conversationId");
        postAs(ben, "/api/groups/join", Map.of("code", read(getAs(amy, "/api/groups"), "$[0].inviteCode")));
        try (EventStreamClient amyStream = EventStreamClient.open(port, amy.accessToken());
                EventStreamClient benStream = EventStreamClient.open(port, ben.accessToken());
                EventStreamClient cleoStream = EventStreamClient.open(port, cleo.accessToken())) {
            postAs(ben, "/api/conversations/" + chatId + "/typing").andExpect(status().isNoContent());

            StreamEvent typing = amyStream.await(named("typing"), "Amy to see Ben typing");
            assertThat(typing.data()).contains(chatId).contains("\"displayName\":\"Ben\"");
            settle();
            assertThat(benStream.events()).noneMatch(named("typing"));
            assertThat(cleoStream.events()).noneMatch(named("typing"));
        }
        DATABASE.execute("do $$ begin if exists (select 1 from messages where body ilike '%typing%') then raise exception 'typing stored'; end if; end $$");
        assertThat(groupId).isNotBlank();
    }

    @Test
    void groupMessagesEditsAndReactionsReachMembersButNotOutsiders() throws Exception {
        postAs(amy, "/api/groups", Map.of("name", "Study Buddies"));
        String chatId = read(getAs(amy, "/api/groups"), "$[0].conversationId");
        postAs(ben, "/api/groups/join", Map.of("code", read(getAs(amy, "/api/groups"), "$[0].inviteCode")));
        try (EventStreamClient benStream = EventStreamClient.open(port, ben.accessToken());
                EventStreamClient cleoStream = EventStreamClient.open(port, cleo.accessToken())) {
            Integer messageId = read(postAs(amy, "/api/conversations/" + chatId + "/messages", Map.of("body", "Library at 4?")), "$.id");
            benStream.await(event -> event.name().equals("message") && event.data().contains("Library at 4?"), "Ben to get the message");

            patchAs(amy, "/api/messages/" + messageId, Map.of("body", "Library at 5?"));
            benStream.await(event -> event.name().equals("message-updated") && event.data().contains("Library at 5?"), "Ben to see the edit");

            putAs(ben, "/api/messages/" + messageId + "/reactions", Map.of("emoji", "👍"));
            benStream.await(event -> event.name().equals("message-updated") && event.data().contains("👍"), "the reaction to show live");

            // Cleo joining is announced to Ben; from then on she gets the chat's messages too.
            postAs(cleo, "/api/groups/join", Map.of("code", read(getAs(amy, "/api/groups"), "$[0].inviteCode")));
            benStream.await(event -> event.name().equals("message") && event.data().contains("Cleo joined the group."), "the join note");
            postAs(amy, "/api/conversations/" + chatId + "/messages", Map.of("body", "Welcome Cleo"));
            cleoStream.await(event -> event.name().equals("message") && event.data().contains("Welcome Cleo"), "Cleo to get messages once in");
            assertThat(cleoStream.events()).noneMatch(event -> event.data().contains("Library at"));
        }
    }
}
