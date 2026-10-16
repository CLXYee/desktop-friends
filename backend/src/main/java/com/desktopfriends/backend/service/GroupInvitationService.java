package com.desktopfriends.backend.service;

import com.desktopfriends.backend.dto.response.GroupInvitationResponse;
import com.desktopfriends.backend.dto.response.GroupInvitationResponse.InviterResponse;
import com.desktopfriends.backend.dto.response.JoinGroupResponse;
import com.desktopfriends.backend.entity.GroupInvitation;
import com.desktopfriends.backend.entity.Profile;
import com.desktopfriends.backend.exception.NotFoundException;
import com.desktopfriends.backend.repository.GroupInvitationRepository;
import com.desktopfriends.backend.repository.GroupMemberRepository;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Invitations to groups that were sent to the user: listing, accepting (joining) and declining. */
@Service
public class GroupInvitationService {

    private final GroupInvitationRepository groupInvitationRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupService groupService;

    public GroupInvitationService(GroupInvitationRepository groupInvitationRepository,
            GroupMemberRepository groupMemberRepository, GroupService groupService) {
        this.groupInvitationRepository = groupInvitationRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupService = groupService;
    }

    @Transactional(readOnly = true)
    public List<GroupInvitationResponse> listInvitations(UUID userId) {
        return groupInvitationRepository.findAllForInvitee(userId).stream().map(GroupInvitationService::toResponse).toList();
    }

    /** Joins the group and removes the invitation. */
    @Transactional
    public JoinGroupResponse acceptInvitation(UUID userId, UUID invitationId) {
        GroupInvitation invitation = findInvitationFor(userId, invitationId);
        String groupName = invitation.getGroup().getName();
        groupInvitationRepository.delete(invitation);
        groupInvitationRepository.flush();
        groupMemberRepository.insertMemberIfAbsent(invitation.getGroupId(), userId);
        groupService.publishGroupsChanged(invitation.getGroupId(), Set.of(userId));
        return new JoinGroupResponse(invitation.getGroupId(), groupName);
    }

    /** Removes the invitation without joining. */
    @Transactional
    public void declineInvitation(UUID userId, UUID invitationId) {
        GroupInvitation invitation = findInvitationFor(userId, invitationId);
        groupInvitationRepository.delete(invitation);
        groupService.publishGroupsChanged(invitation.getGroupId(), Set.of(userId));
    }

    private GroupInvitation findInvitationFor(UUID userId, UUID invitationId) {
        return groupInvitationRepository.findByIdAndInviteeId(invitationId, userId)
                .orElseThrow(() -> new NotFoundException("That invitation is no longer available."));
    }

    private static GroupInvitationResponse toResponse(GroupInvitation invitation) {
        Profile inviter = invitation.getInviter();
        return new GroupInvitationResponse(invitation.getId(), invitation.getGroupId(), invitation.getGroup().getName(),
                inviter == null ? null : new InviterResponse(inviter.getUsername(), inviter.getDisplayName()),
                invitation.getCreatedAt());
    }
}
