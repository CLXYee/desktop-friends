package com.desktopfriends.backend.controller;

import com.desktopfriends.backend.dto.response.GroupInvitationResponse;
import com.desktopfriends.backend.dto.response.JoinGroupResponse;
import com.desktopfriends.backend.security.CurrentUserId;
import com.desktopfriends.backend.service.GroupInvitationService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Invitations to groups that were sent to the user. */
@RestController
@RequestMapping("/api/group-invitations")
public class GroupInvitationController {

    private final GroupInvitationService groupInvitationService;

    public GroupInvitationController(GroupInvitationService groupInvitationService) {
        this.groupInvitationService = groupInvitationService;
    }

    @GetMapping
    public List<GroupInvitationResponse> listInvitations(@CurrentUserId UUID userId) {
        return groupInvitationService.listInvitations(userId);
    }

    @PostMapping("/{invitationId}/accept")
    public JoinGroupResponse acceptInvitation(@CurrentUserId UUID userId, @PathVariable UUID invitationId) {
        return groupInvitationService.acceptInvitation(userId, invitationId);
    }

    @PostMapping("/{invitationId}/decline")
    public ResponseEntity<Void> declineInvitation(@CurrentUserId UUID userId, @PathVariable UUID invitationId) {
        groupInvitationService.declineInvitation(userId, invitationId);
        return ResponseEntity.noContent().build();
    }
}
