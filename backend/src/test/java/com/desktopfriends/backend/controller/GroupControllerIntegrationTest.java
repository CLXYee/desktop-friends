package com.desktopfriends.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.desktopfriends.backend.support.IntegrationTestSupport;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Groups: create, invite friends, invitations, join by link, reset the link, leave")
class GroupControllerIntegrationTest extends IntegrationTestSupport {

    private TestUser amy;
    private TestUser ben;
    private TestUser cleo;

    @BeforeEach
    void signUpAmyWithTwoFriends() throws Exception {
        amy = signUp("friend_amy", "Amy");
        ben = signUp("friend_ben", "Ben");
        cleo = signUp("friend_cleo", "Cleo");
        makeFriends(amy, ben);
        makeFriends(amy, cleo);
    }

    private void makeFriends(TestUser first, TestUser second) throws Exception {
        postAs(first, "/api/friends/requests", Map.of("username", second.username())).andExpect(status().isCreated());
        String requestId = read(getAs(second, "/api/friends"), "$.incoming[0].id");
        postAs(second, "/api/friends/requests/" + requestId + "/accept").andExpect(status().isNoContent());
    }

    private String createGroup(TestUser owner, String name) throws Exception {
        return read(postAs(owner, "/api/groups", Map.of("name", name)).andExpect(status().isCreated()), "$.id");
    }

    private String inviteCode(TestUser member) throws Exception {
        return read(getAs(member, "/api/groups"), "$[0].inviteCode");
    }

    private void invite(TestUser inviter, String groupId, TestUser friend) throws Exception {
        postAs(inviter, "/api/groups/" + groupId + "/invitations", Map.of("friendId", friend.id())).andExpect(status().isCreated());
    }

    private String invitationId(TestUser invitee) throws Exception {
        return read(getAs(invitee, "/api/group-invitations"), "$[0].id");
    }

    @Test
    void createsAGroupWithTheCreatorAsOwner() throws Exception {
        postAs(amy, "/api/groups", Map.of("name", "  Study Buddies "))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Study Buddies"))
                .andExpect(jsonPath("$.inviteCode").value(Matchers.matchesPattern("^[0-9a-f]{12}$")))
                .andExpect(jsonPath("$.members.length()").value(1))
                .andExpect(jsonPath("$.members[0].username").value("friend_amy"))
                .andExpect(jsonPath("$.members[0].role").value("owner"))
                .andExpect(jsonPath("$.invitedIds").isEmpty());
        getAs(amy, "/api/groups").andExpect(jsonPath("$[0].name").value("Study Buddies"));
        getAs(ben, "/api/groups").andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void groupNamesAreOneToFortyCharacters() throws Exception {
        postAs(amy, "/api/groups", Map.of("name", "   "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Group names are 1–40 characters."));
        postAs(amy, "/api/groups", Map.of("name", "x".repeat(41))).andExpect(status().isBadRequest());
        postAs(amy, "/api/groups", Map.of("name", "x".repeat(40))).andExpect(status().isCreated());
        postAs(amy, "/api/groups", Map.of()).andExpect(status().isBadRequest());
    }

    @Test
    void anInvitedFriendSeesTheInvitationAndJoins() throws Exception {
        String groupId = createGroup(amy, "Study Buddies");
        invite(amy, groupId, ben);

        postAs(amy, "/api/groups/" + groupId + "/invitations", Map.of("friendId", ben.id()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("They already have an invitation to this group."));
        getAs(amy, "/api/groups").andExpect(jsonPath("$[0].invitedIds[0]").value(ben.id()));

        getAs(ben, "/api/groups").andExpect(jsonPath("$").isEmpty());
        getAs(ben, "/api/group-invitations")
                .andExpect(jsonPath("$[0].groupId").value(groupId))
                .andExpect(jsonPath("$[0].groupName").value("Study Buddies"))
                .andExpect(jsonPath("$[0].inviter.displayName").value("Amy"))
                .andExpect(jsonPath("$[0].inviter.username").value("friend_amy"));
        String invitation = invitationId(ben);

        postAs(cleo, "/api/group-invitations/" + invitation + "/accept")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("That invitation is no longer available."));

        postAs(ben, "/api/group-invitations/" + invitation + "/accept")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groupId").value(groupId))
                .andExpect(jsonPath("$.groupName").value("Study Buddies"));
        getAs(ben, "/api/groups")
                .andExpect(jsonPath("$[0].members[0].username").value("friend_amy"))
                .andExpect(jsonPath("$[0].members[0].role").value("owner"))
                .andExpect(jsonPath("$[0].members[1].username").value("friend_ben"))
                .andExpect(jsonPath("$[0].members[1].role").value("member"))
                .andExpect(jsonPath("$[0].invitedIds").isEmpty());
        getAs(ben, "/api/group-invitations").andExpect(jsonPath("$").isEmpty());
        postAs(ben, "/api/group-invitations/" + invitation + "/accept").andExpect(status().isNotFound());
    }

    @Test
    void onlyMembersInviteAndOnlyTheirFriendsWhoArentInYet() throws Exception {
        String groupId = createGroup(amy, "Study Buddies");
        invite(amy, groupId, ben);
        postAs(ben, "/api/group-invitations/" + invitationId(ben) + "/accept");

        // Ben and Cleo aren't friends.
        postAs(ben, "/api/groups/" + groupId + "/invitations", Map.of("friendId", cleo.id()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("You can only invite your friends."));
        postAs(ben, "/api/groups/" + groupId + "/invitations", Map.of("friendId", amy.id()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("They are already in this group."));
        postAs(cleo, "/api/groups/" + groupId + "/invitations", Map.of("friendId", amy.id()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Only members can invite people to this group."));
        postAs(amy, "/api/groups/" + UUID.randomUUID() + "/invitations", Map.of("friendId", ben.id()))
                .andExpect(status().isForbidden());
        postAs(amy, "/api/groups/" + groupId + "/invitations", Map.of())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Choose a friend to invite."));
        getAs(cleo, "/api/groups").andExpect(jsonPath("$").isEmpty());
    }

    @Test
    void aDeclinedInvitationDisappears() throws Exception {
        String groupId = createGroup(amy, "Study Buddies");
        invite(amy, groupId, cleo);
        postAs(cleo, "/api/group-invitations/" + invitationId(cleo) + "/decline").andExpect(status().isNoContent());
        getAs(cleo, "/api/group-invitations").andExpect(jsonPath("$").isEmpty());
        getAs(cleo, "/api/groups").andExpect(jsonPath("$").isEmpty());
        getAs(amy, "/api/groups").andExpect(jsonPath("$[0].invitedIds").isEmpty());
    }

    @Test
    void anyoneWithTheLinkJoinsAndMembersSeeEachOthersStatus() throws Exception {
        String groupId = createGroup(amy, "Study Buddies");
        invite(amy, groupId, ben);
        postAs(ben, "/api/group-invitations/" + invitationId(ben) + "/accept");
        String code = inviteCode(amy);

        postAs(cleo, "/api/groups/join", Map.of("code", "000000000000"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("That invite link doesn't work. It may have been reset; ask for a new one."));
        postAs(cleo, "/api/groups/join", Map.of("code", " DESKTOP-FRIENDS://JOIN/" + code.toUpperCase() + "/ "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groupId").value(groupId))
                .andExpect(jsonPath("$.groupName").value("Study Buddies"));
        postAs(cleo, "/api/groups/join", Map.of("code", code)).andExpect(status().isOk());
        getAs(cleo, "/api/groups").andExpect(jsonPath("$[0].members.length()").value(3));

        // Cleo and Ben aren't friends, but share a group, so she sees his status.
        putAs(ben, "/api/presence", Map.of("status", "online"));
        List<String> presence = readList(getAs(cleo, "/api/groups"), "$[0].members[?(@.username == 'friend_ben')].presence");
        assertThat(presence).containsExactly("online");
        postAs(cleo, "/api/groups/join", Map.of("code", "")).andExpect(status().isBadRequest());
    }

    @Test
    void joiningByLinkClearsAPendingInvitation() throws Exception {
        String groupId = createGroup(amy, "Study Buddies");
        invite(amy, groupId, cleo);
        postAs(cleo, "/api/groups/join", Map.of("code", inviteCode(amy))).andExpect(status().isOk());
        getAs(cleo, "/api/group-invitations").andExpect(jsonPath("$").isEmpty());
        getAs(amy, "/api/groups").andExpect(jsonPath("$[0].invitedIds").isEmpty());
    }

    @Test
    void onlyTheOwnerResetsTheLinkAndTheOldOneStopsWorking() throws Exception {
        String groupId = createGroup(amy, "Study Buddies");
        String oldCode = inviteCode(amy);
        postAs(ben, "/api/groups/join", Map.of("code", oldCode));

        postAs(ben, "/api/groups/" + groupId + "/invite-code/reset")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Only the group's owner can reset its invite link."));
        String newCode = read(postAs(amy, "/api/groups/" + groupId + "/invite-code/reset").andExpect(status().isOk()), "$.inviteCode");
        assertThat(newCode).matches("^[0-9a-f]{12}$").isNotEqualTo(oldCode);
        assertThat(inviteCode(ben)).isEqualTo(newCode);

        postAs(cleo, "/api/groups/join", Map.of("code", oldCode)).andExpect(status().isNotFound());
        postAs(cleo, "/api/groups/join", Map.of("code", newCode)).andExpect(status().isOk());
    }

    @Test
    void anOwnerLeavingHandsTheGroupToTheLongestStandingMemberAndTheLastOneOutDeletesIt() throws Exception {
        String groupId = createGroup(amy, "Study Buddies");
        String code = inviteCode(amy);
        postAs(ben, "/api/groups/join", Map.of("code", code));
        postAs(cleo, "/api/groups/join", Map.of("code", code));

        postAs(amy, "/api/groups/" + groupId + "/leave").andExpect(status().isNoContent());
        getAs(amy, "/api/groups").andExpect(jsonPath("$").isEmpty());
        postAs(amy, "/api/groups/" + groupId + "/leave")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("You are not in this group."));
        getAs(ben, "/api/groups")
                .andExpect(jsonPath("$[0].members[0].username").value("friend_ben"))
                .andExpect(jsonPath("$[0].members[0].role").value("owner"))
                .andExpect(jsonPath("$[0].members[1].username").value("friend_cleo"))
                .andExpect(jsonPath("$[0].members[1].role").value("member"));

        // A member (not the owner) leaving changes no roles.
        postAs(cleo, "/api/groups/" + groupId + "/leave").andExpect(status().isNoContent());
        getAs(ben, "/api/groups").andExpect(jsonPath("$[0].members.length()").value(1)).andExpect(jsonPath("$[0].members[0].role").value("owner"));

        // A pending invitation goes away with the group.
        makeFriends(ben, cleo);
        invite(ben, groupId, cleo);
        postAs(ben, "/api/groups/" + groupId + "/leave").andExpect(status().isNoContent());
        getAs(ben, "/api/groups").andExpect(jsonPath("$").isEmpty());
        getAs(cleo, "/api/group-invitations").andExpect(jsonPath("$").isEmpty());
        postAs(cleo, "/api/groups/join", Map.of("code", code)).andExpect(status().isNotFound());
    }
}
