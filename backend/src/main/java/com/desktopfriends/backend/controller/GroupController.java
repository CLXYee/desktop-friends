package com.desktopfriends.backend.controller;

import com.desktopfriends.backend.dto.request.CreateGroupRequest;
import com.desktopfriends.backend.dto.request.InviteToGroupRequest;
import com.desktopfriends.backend.dto.request.JoinGroupRequest;
import com.desktopfriends.backend.dto.request.UpdateGroupRequest;
import com.desktopfriends.backend.dto.response.GroupResponse;
import com.desktopfriends.backend.dto.response.InviteCodeResponse;
import com.desktopfriends.backend.dto.response.JoinGroupResponse;
import com.desktopfriends.backend.security.CurrentUserId;
import com.desktopfriends.backend.service.GroupService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Groups the user belongs to: create, edit, invite friends, join by link, leave, reset the link. */
@RestController
@RequestMapping("/api/groups")
public class GroupController {

    private final GroupService groupService;

    public GroupController(GroupService groupService) {
        this.groupService = groupService;
    }

    @GetMapping
    public List<GroupResponse> listGroups(@CurrentUserId UUID userId) {
        return groupService.listGroups(userId);
    }

    @PostMapping
    public ResponseEntity<GroupResponse> createGroup(@CurrentUserId UUID userId, @Valid @RequestBody CreateGroupRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(groupService.createGroup(userId, request.name(), request.description(), request.characterId()));
    }

    /** Owner only: changes the name, description or character (fields left out stay as they are). */
    @PatchMapping("/{groupId}")
    public GroupResponse updateGroup(@CurrentUserId UUID userId, @PathVariable UUID groupId, @RequestBody UpdateGroupRequest request) {
        return groupService.updateGroup(userId, groupId, request);
    }

    /** Joins with an invite link or code. */
    @PostMapping("/join")
    public JoinGroupResponse joinGroup(@CurrentUserId UUID userId, @Valid @RequestBody JoinGroupRequest request) {
        return groupService.joinByInviteCode(userId, request.code());
    }

    @PostMapping("/{groupId}/invitations")
    public ResponseEntity<Void> inviteFriend(@CurrentUserId UUID userId, @PathVariable UUID groupId,
            @Valid @RequestBody InviteToGroupRequest request) {
        groupService.inviteFriend(userId, groupId, request.friendId());
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @PostMapping("/{groupId}/leave")
    public ResponseEntity<Void> leaveGroup(@CurrentUserId UUID userId, @PathVariable UUID groupId) {
        groupService.leaveGroup(userId, groupId);
        return ResponseEntity.noContent().build();
    }

    /** Owner only: replaces the invite code so older links stop working. */
    @PostMapping("/{groupId}/invite-code/reset")
    public InviteCodeResponse resetInviteCode(@CurrentUserId UUID userId, @PathVariable UUID groupId) {
        return groupService.resetInviteCode(userId, groupId);
    }
}
