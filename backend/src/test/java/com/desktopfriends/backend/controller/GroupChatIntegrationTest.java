package com.desktopfriends.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.desktopfriends.backend.support.IntegrationTestSupport;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Group chat: one chat per group, members only, messages, unread, paging, replies, edits, reactions")
class GroupChatIntegrationTest extends IntegrationTestSupport {

    private TestUser amy;
    private TestUser ben;
    private TestUser cleo;
    private String groupId;
    private String chatId;

    @BeforeEach
    void amyStartsAGroupWithBen() throws Exception {
        amy = signUp("friend_amy", "Amy");
        ben = signUp("friend_ben", "Ben");
        cleo = signUp("friend_cleo", "Cleo");
        befriend(amy, ben);
        befriend(amy, cleo);
        var created = postAs(amy, "/api/groups", Map.of("name", "Study Buddies", "description", "  Exams in June ", "characterId", "starry"))
                .andExpect(status().isCreated());
        groupId = read(created, "$.id");
        chatId = read(created, "$.conversationId");
        postAs(amy, "/api/groups/" + groupId + "/invitations", Map.of("friendId", ben.id()));
        postAs(ben, "/api/group-invitations/" + read(getAs(ben, "/api/group-invitations"), "$[0].id") + "/accept")
                .andExpect(status().isOk());
    }

    private String send(TestUser user, String body) throws Exception {
        return String.valueOf((Integer) read(postAs(user, "/api/conversations/" + chatId + "/messages", Map.of("body", body))
                .andExpect(status().isCreated()), "$.id"));
    }

    private List<String> bodies(TestUser user, String query) throws Exception {
        return readList(getAs(user, "/api/conversations/" + chatId + "/messages" + query), "$.messages[*].body");
    }

    @Test
    void theGroupComesWithOneChatThatShowsItsDetails() throws Exception {
        assertThat(chatId).isNotNull();
        DATABASE.execute("do $$ begin if (select count(*) from conversations where kind = 'group') <> 1 then raise exception 'not one chat'; end if; end $$");
        getAs(amy, "/api/groups")
                .andExpect(jsonPath("$[0].description").value("Exams in June"))
                .andExpect(jsonPath("$[0].characterId").value("starry"))
                .andExpect(jsonPath("$[0].conversationId").value(chatId));
        getAs(ben, "/api/conversations")
                .andExpect(jsonPath("$[0].id").value(chatId))
                .andExpect(jsonPath("$[0].kind").value("group"))
                .andExpect(jsonPath("$[0].title").value("Study Buddies"))
                .andExpect(jsonPath("$[0].characterId").value("starry"))
                .andExpect(jsonPath("$[0].group.description").value("Exams in June"))
                .andExpect(jsonPath("$[0].group.memberCount").value(2))
                .andExpect(jsonPath("$[0].canSend").value(true));
        // The app notes who created and who joined.
        assertThat(bodies(ben, "")).containsExactly("Amy created the group.", "Ben joined the group.");
        getAs(ben, "/api/conversations/" + chatId + "/messages")
                .andExpect(jsonPath("$.messages[0].kind").value("system"))
                .andExpect(jsonPath("$.messages[1].sender.displayName").value("Ben"));
    }

    @Test
    void membersChatAndEveryMessageCarriesItsSenderAndTime() throws Exception {
        putAs(ben, "/api/profiles/me", Map.of("characterId", "lovie")).andExpect(status().isOk());
        send(amy, "Hi Ben!");
        send(ben, "  Hey Amy 👋  ");
        getAs(amy, "/api/conversations/" + chatId + "/messages")
                .andExpect(jsonPath("$.messages[2].body").value("Hi Ben!"))
                .andExpect(jsonPath("$.messages[2].kind").value("text"))
                .andExpect(jsonPath("$.messages[2].sender.username").value("friend_amy"))
                .andExpect(jsonPath("$.messages[2].createdAt").isNotEmpty())
                .andExpect(jsonPath("$.messages[3].body").value("Hey Amy 👋"))
                .andExpect(jsonPath("$.messages[3].sender.displayName").value("Ben"))
                .andExpect(jsonPath("$.messages[3].sender.characterId").value("lovie"))
                .andExpect(jsonPath("$.hasMore").value(false));
        getAs(amy, "/api/conversations")
                .andExpect(jsonPath("$[0].lastMessage.body").value("Hey Amy 👋"))
                .andExpect(jsonPath("$[0].lastMessageAt").isNotEmpty());
    }

    @Test
    void outsidersCanNeitherReadNorWrite() throws Exception {
        getAs(cleo, "/api/conversations/" + chatId + "/messages")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("That chat isn't available. You may have left it."));
        postAs(cleo, "/api/conversations/" + chatId + "/messages", Map.of("body", "let me in"))
                .andExpect(status().isNotFound());
        getAs(cleo, "/api/conversations").andExpect(jsonPath("$").isEmpty());
        String messageId = send(amy, "secret plans");
        postAs(cleo, "/api/conversations/" + chatId + "/typing").andExpect(status().isNotFound());
        putAs(cleo, "/api/messages/" + messageId + "/reactions", Map.of("emoji", "👍")).andExpect(status().isNotFound());
    }

    @Test
    void unreadCountsOthersMessagesUntilTheChatIsRead() throws Exception {
        postAs(ben, "/api/conversations/" + chatId + "/read").andExpect(status().isNoContent());
        clock.advance(Duration.ofSeconds(1));
        send(amy, "one");
        send(amy, "two");
        getAs(ben, "/api/conversations").andExpect(jsonPath("$[0].unreadCount").value(2));
        // Your own messages are never unread.
        getAs(amy, "/api/conversations").andExpect(jsonPath("$[0].unreadCount").value(0));
        postAs(ben, "/api/conversations/" + chatId + "/read").andExpect(status().isNoContent());
        getAs(ben, "/api/conversations").andExpect(jsonPath("$[0].unreadCount").value(0));
        // Replying counts as reading.
        clock.advance(Duration.ofSeconds(1));
        send(amy, "three");
        send(ben, "reply");
        getAs(ben, "/api/conversations").andExpect(jsonPath("$[0].unreadCount").value(0));
    }

    @Test
    void joiningAndLeavingTheGroupJoinsAndLeavesTheChat() throws Exception {
        String code = read(getAs(amy, "/api/groups"), "$[0].inviteCode");
        postAs(cleo, "/api/groups/join", Map.of("code", code)).andExpect(status().isOk());
        send(cleo, "Hi all");
        assertThat(bodies(amy, "")).contains("Cleo joined the group.", "Hi all");
        getAs(amy, "/api/conversations").andExpect(jsonPath("$[0].group.memberCount").value(3));

        postAs(cleo, "/api/groups/" + groupId + "/leave").andExpect(status().isNoContent());
        getAs(cleo, "/api/conversations/" + chatId + "/messages").andExpect(status().isNotFound());
        // Marking read or muting a chat you've just left is refused cleanly (the app may still have it open).
        postAs(cleo, "/api/conversations/" + chatId + "/read").andExpect(status().isNotFound());
        putAs(cleo, "/api/conversations/" + chatId + "/mute", Map.of("muted", true)).andExpect(status().isNotFound());
        postAs(cleo, "/api/conversations/" + chatId + "/messages", Map.of("body", "still here?")).andExpect(status().isNotFound());
        assertThat(bodies(amy, "")).contains("Cleo left the group.");

        // The owner leaving hands the group on, and the chat says so.
        postAs(amy, "/api/groups/" + groupId + "/leave").andExpect(status().isNoContent());
        assertThat(bodies(ben, "")).contains("Amy left the group.", "Ben is now the owner.");

        // The last one out deletes the group, and its chat with it.
        postAs(ben, "/api/groups/" + groupId + "/leave").andExpect(status().isNoContent());
        DATABASE.execute("do $$ begin if exists (select 1 from conversations) or exists (select 1 from messages) then raise exception 'chat left behind'; end if; end $$");
    }

    @Test
    void readsOlderMessagesFiftyAtATime() throws Exception {
        for (int i = 1; i <= 12; i++) {
            send(i % 2 == 0 ? amy : ben, "message " + i);
            if (i % 5 == 0) clock.advance(Duration.ofSeconds(11)); // stay under the rate limit
        }
        // 2 notes + 12 messages; pages of 5 to keep the test short.
        var firstPage = getAs(amy, "/api/conversations/" + chatId + "/messages?limit=5")
                .andExpect(jsonPath("$.hasMore").value(true));
        assertThat(readList(firstPage, "$.messages[*].body")).containsExactly("message 8", "message 9", "message 10", "message 11", "message 12");
        Integer cursor = read(firstPage, "$.nextCursor");

        var second = getAs(amy, "/api/conversations/" + chatId + "/messages?limit=5&before=" + cursor);
        assertThat(readList(second, "$.messages[*].body")).containsExactly("message 3", "message 4", "message 5", "message 6", "message 7");
        var third = getAs(amy, "/api/conversations/" + chatId + "/messages?limit=5&before=" + read(second, "$.nextCursor"))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.nextCursor").value(Matchers.nullValue()));
        assertThat(readList(third, "$.messages[*].body")).containsExactly("Amy created the group.", "Ben joined the group.", "message 1", "message 2");

        // Without a limit, a page is at most 50.
        assertThat(bodies(amy, "?limit=500")).hasSize(14);
    }

    @Test
    void checksWhatIsSent() throws Exception {
        postAs(amy, "/api/conversations/" + chatId + "/messages", Map.of("body", "   "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Write a message first."));
        postAs(amy, "/api/conversations/" + chatId + "/messages", Map.of("body", "x".repeat(2001)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Messages can be at most 2000 characters."));
        postAs(amy, "/api/conversations/" + chatId + "/messages", Map.of("body", "😀".repeat(2000)))
                .andExpect(status().isCreated());
        postAs(amy, "/api/conversations/" + chatId + "/messages", Map.of()).andExpect(status().isBadRequest());
    }

    @Test
    void slowsDownSomeoneSendingTooFast() throws Exception {
        for (int i = 0; i < 10; i++) send(amy, "spam " + i);
        postAs(amy, "/api/conversations/" + chatId + "/messages", Map.of("body", "one too many"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("You're sending messages too fast. Wait a few seconds."));
        // Others aren't affected, and it passes after a few seconds.
        send(ben, "I can still talk");
        clock.advance(Duration.ofSeconds(11));
        send(amy, "back again");
    }

    @Test
    void repliesQuoteAMessageOfTheSameChat() throws Exception {
        String question = send(amy, "Who's bringing snacks?");
        var reply = postAs(ben, "/api/conversations/" + chatId + "/messages", Map.of("body", "Me!", "replyToId", Long.parseLong(question)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.replyTo.id").value(Long.parseLong(question)))
                .andExpect(jsonPath("$.replyTo.senderName").value("Amy"))
                .andExpect(jsonPath("$.replyTo.body").value("Who's bringing snacks?"));
        assertThat((Integer) read(reply, "$.id")).isPositive();

        // A message from another chat can't be quoted.
        String otherGroupChat = read(postAs(cleo, "/api/groups", Map.of("name", "Other")), "$.conversationId");
        Integer elsewhere = read(postAs(cleo, "/api/conversations/" + otherGroupChat + "/messages", Map.of("body", "elsewhere")), "$.id");
        postAs(ben, "/api/conversations/" + chatId + "/messages", Map.of("body", "?", "replyToId", elsewhere))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("You can only reply to a message in this chat."));
    }

    @Test
    void peopleEditAndDeleteOnlyTheirOwnMessages() throws Exception {
        String messageId = send(amy, "See you at 5");
        patchAs(ben, "/api/messages/" + messageId, Map.of("body", "hacked"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("You can only edit your own messages."));
        patchAs(amy, "/api/messages/" + messageId, Map.of("body", "See you at 6"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("See you at 6"))
                .andExpect(jsonPath("$.editedAt").isNotEmpty());

        putAs(ben, "/api/messages/" + messageId + "/reactions", Map.of("emoji", "👍")).andExpect(status().isOk());
        deleteAs(ben, "/api/messages/" + messageId)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("You can only delete your own messages."));
        deleteAs(amy, "/api/messages/" + messageId).andExpect(status().isNoContent());
        deleteAs(amy, "/api/messages/" + messageId).andExpect(status().isNoContent());

        getAs(ben, "/api/conversations/" + chatId + "/messages")
                .andExpect(jsonPath("$.messages[2].deleted").value(true))
                .andExpect(jsonPath("$.messages[2].body").value(""))
                .andExpect(jsonPath("$.messages[2].reactions").isEmpty());
        patchAs(amy, "/api/messages/" + messageId, Map.of("body", "undo"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("That message was deleted."));
        // System notes are nobody's to edit.
        Integer noteId = read(getAs(amy, "/api/conversations/" + chatId + "/messages"), "$.messages[0].id");
        patchAs(amy, "/api/messages/" + noteId, Map.of("body", "rewritten")).andExpect(status().isForbidden());
    }

    @Test
    void reactionsAreAddedOncePerPersonAndCanBeTakenBack() throws Exception {
        String messageId = send(amy, "We passed!");
        putAs(ben, "/api/messages/" + messageId + "/reactions", Map.of("emoji", "🎉")).andExpect(status().isOk());
        putAs(ben, "/api/messages/" + messageId + "/reactions", Map.of("emoji", "🎉")).andExpect(status().isOk());
        putAs(amy, "/api/messages/" + messageId + "/reactions", Map.of("emoji", "🎉")).andExpect(status().isOk());
        putAs(amy, "/api/messages/" + messageId + "/reactions", Map.of("emoji", "👍"))
                .andExpect(status().isOk())
                // In picker order: 👍 before 🎉.
                .andExpect(jsonPath("$.reactions[0].emoji").value("👍"))
                .andExpect(jsonPath("$.reactions[1].emoji").value("🎉"))
                .andExpect(jsonPath("$.reactions[1].userIds.length()").value(2));
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/messages/" + messageId + "/reactions").param("emoji", "🎉")
                        .header("Authorization", "Bearer " + ben.accessToken()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reactions[1].userIds[0]").value(amy.id()));
        putAs(ben, "/api/messages/" + messageId + "/reactions", Map.of("emoji", "🤖"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value(Matchers.startsWith("Pick one of the reactions")));
    }

    @Test
    void onlyTheOwnerEditsTheGroupAndARenameIsNoted() throws Exception {
        patchAs(ben, "/api/groups/" + groupId, Map.of("name", "Ben's group"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Only the group's owner can change its details."));
        patchAs(amy, "/api/groups/" + groupId, Map.of("characterId", "dragon"))
                .andExpect(status().isBadRequest());
        patchAs(amy, "/api/groups/" + groupId, Map.of("description", "x".repeat(201))).andExpect(status().isBadRequest());
        patchAs(amy, "/api/groups/" + groupId, Map.of("name", "Exam Crew", "characterId", "cloudy"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Exam Crew"))
                .andExpect(jsonPath("$.description").value("Exams in June"))
                .andExpect(jsonPath("$.characterId").value("cloudy"));
        getAs(ben, "/api/conversations").andExpect(jsonPath("$[0].title").value("Exam Crew"));
        assertThat(bodies(ben, "")).contains("Amy renamed the group to “Exam Crew”.");
    }

    @Test
    void muteIsPerPerson() throws Exception {
        putAs(ben, "/api/conversations/" + chatId + "/mute", Map.of("muted", true)).andExpect(status().isNoContent());
        getAs(ben, "/api/conversations").andExpect(jsonPath("$[0].muted").value(true));
        getAs(amy, "/api/conversations").andExpect(jsonPath("$[0].muted").value(false));
    }
}
