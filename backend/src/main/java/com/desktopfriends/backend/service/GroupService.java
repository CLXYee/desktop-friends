package com.desktopfriends.backend.service;

import com.desktopfriends.backend.dto.response.GroupMemberResponse;
import com.desktopfriends.backend.dto.response.GroupResponse;
import com.desktopfriends.backend.dto.response.InviteCodeResponse;
import com.desktopfriends.backend.dto.response.JoinGroupResponse;
import com.desktopfriends.backend.entity.FriendGroup;
import com.desktopfriends.backend.entity.GroupInvitation;
import com.desktopfriends.backend.entity.GroupMember;
import com.desktopfriends.backend.entity.GroupRole;
import com.desktopfriends.backend.entity.Profile;
import com.desktopfriends.backend.event.SocialEvent;
import com.desktopfriends.backend.exception.BadRequestException;
import com.desktopfriends.backend.exception.ConflictException;
import com.desktopfriends.backend.exception.ForbiddenException;
import com.desktopfriends.backend.exception.NotFoundException;
import com.desktopfriends.backend.repository.FriendGroupRepository;
import com.desktopfriends.backend.repository.FriendshipRepository;
import com.desktopfriends.backend.repository.GroupInvitationRepository;
import com.desktopfriends.backend.repository.GroupMemberRepository;
import com.desktopfriends.backend.repository.ProfileRepository;
import java.time.Clock;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Groups: creating, inviting friends, joining by invite link, leaving, and resetting the link. Every member
 * may invite their friends; only the owner may reset the link. When the owner leaves, the longest-standing
 * member takes over; the last member to leave deletes the group.
 */
@Service
public class GroupService {

    public static final int GROUP_NAME_MAX = 40;
    private static final Comparator<GroupMember> OWNER_FIRST = Comparator
            .comparing((GroupMember member) -> !member.isOwner())
            .thenComparing(GroupMember::getJoinedAt)
            .thenComparing(GroupMember::getUserId);

    private final FriendGroupRepository friendGroupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupInvitationRepository groupInvitationRepository;
    private final FriendshipRepository friendshipRepository;
    private final ProfileRepository profileRepository;
    private final PresenceService presenceService;
    private final InviteCodeGenerator inviteCodeGenerator;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    public GroupService(FriendGroupRepository friendGroupRepository, GroupMemberRepository groupMemberRepository,
            GroupInvitationRepository groupInvitationRepository, FriendshipRepository friendshipRepository,
            ProfileRepository profileRepository, PresenceService presenceService, InviteCodeGenerator inviteCodeGenerator,
            ApplicationEventPublisher eventPublisher, Clock clock) {
        this.friendGroupRepository = friendGroupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupInvitationRepository = groupInvitationRepository;
        this.friendshipRepository = friendshipRepository;
        this.profileRepository = profileRepository;
        this.presenceService = presenceService;
        this.inviteCodeGenerator = inviteCodeGenerator;
        this.eventPublisher = eventPublisher;
        this.clock = clock;
    }

    /** The groups the user belongs to (groups they are only invited to come from the invitations). */
    @Transactional(readOnly = true)
    public List<GroupResponse> listGroups(UUID userId) {
        return toResponses(friendGroupRepository.findAllByMemberId(userId));
    }

    /** Creates a group with the user as its owner. */
    @Transactional
    public GroupResponse createGroup(UUID userId, String name) {
        String cleanName = name == null ? "" : name.strip();
        if (cleanName.isEmpty() || cleanName.codePointCount(0, cleanName.length()) > GROUP_NAME_MAX) {
            throw new BadRequestException("Group names are 1–" + GROUP_NAME_MAX + " characters.");
        }
        Profile owner = profileRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("Your profile is missing. Log out and in again."));
        FriendGroup group = friendGroupRepository.saveAndFlush(
                new FriendGroup(cleanName, newUniqueInviteCode(), userId, clock.instant()));
        groupMemberRepository.saveAndFlush(new GroupMember(group.getId(), owner, GroupRole.OWNER, clock.instant()));
        eventPublisher.publishEvent(SocialEvent.groupsChanged(List.of(userId)));
        return toResponses(List.of(group)).getFirst();
    }

    /** Invites one of the user's friends to a group the user belongs to. */
    @Transactional
    public void inviteFriend(UUID userId, UUID groupId, UUID friendId) {
        requireMember(groupId, userId, "Only members can invite people to this group.");
        if (!friendshipRepository.areFriends(userId, friendId)) {
            throw new BadRequestException("You can only invite your friends.");
        }
        if (groupMemberRepository.existsByGroupIdAndUserId(groupId, friendId)) {
            throw new ConflictException("They are already in this group.");
        }
        if (groupInvitationRepository.existsByGroupIdAndInviteeId(groupId, friendId)) {
            throw new ConflictException("They already have an invitation to this group.");
        }
        groupInvitationRepository.saveAndFlush(new GroupInvitation(groupId, userId, friendId, clock.instant()));
        publishGroupsChanged(groupId, Set.of(friendId));
    }

    /** Joins the group an invite link (or bare code) points to; joining twice is harmless. */
    @Transactional
    public JoinGroupResponse joinByInviteCode(UUID userId, String linkOrCode) {
        FriendGroup group = friendGroupRepository.findByInviteCode(InviteCodeGenerator.normalize(linkOrCode))
                .orElseThrow(() -> new NotFoundException("That invite link doesn't work. It may have been reset; ask for a new one."));
        groupMemberRepository.insertMemberIfAbsent(group.getId(), userId);
        groupInvitationRepository.deleteByGroupIdAndInviteeId(group.getId(), userId);
        publishGroupsChanged(group.getId(), Set.of(userId));
        return new JoinGroupResponse(group.getId(), group.getName());
    }

    /** Leaves a group, handing it on if the user owned it, or deleting it if they were the last one. */
    @Transactional
    public void leaveGroup(UUID userId, UUID groupId) {
        GroupMember membership = groupMemberRepository.findByGroupIdAndUserId(groupId, userId)
                .orElseThrow(() -> new NotFoundException("You are not in this group."));
        // Tell everyone involved before they're gone from the group: members and pending invitees.
        Set<UUID> audience = new HashSet<>(groupMemberRepository.findUserIdsByGroupId(groupId));
        groupInvitationRepository.findAllByGroupIdIn(List.of(groupId)).forEach(invitation -> audience.add(invitation.getInviteeId()));

        groupMemberRepository.delete(membership);
        groupMemberRepository.flush();
        groupMemberRepository.findFirstByGroupIdOrderByJoinedAtAscUserIdAsc(groupId).ifPresentOrElse(
                successor -> {
                    if (membership.isOwner()) successor.promoteToOwner();
                },
                () -> friendGroupRepository.deleteGroupById(groupId));
        eventPublisher.publishEvent(SocialEvent.groupsChanged(audience));
    }

    /** Replaces the group's invite code so links shared earlier stop working. Owner only. */
    @Transactional
    public InviteCodeResponse resetInviteCode(UUID userId, UUID groupId) {
        GroupMember membership = groupMemberRepository.findByGroupIdAndUserId(groupId, userId)
                .filter(GroupMember::isOwner)
                .orElseThrow(() -> new ForbiddenException("Only the group's owner can reset its invite link."));
        FriendGroup group = friendGroupRepository.findById(membership.getGroupId())
                .orElseThrow(() -> new NotFoundException("That group no longer exists."));
        group.replaceInviteCode(newUniqueInviteCode());
        publishGroupsChanged(groupId, Set.of());
        return new InviteCodeResponse(group.getInviteCode());
    }

    private void requireMember(UUID groupId, UUID userId, String message) {
        if (!groupMemberRepository.existsByGroupIdAndUserId(groupId, userId)) {
            throw new ForbiddenException(message);
        }
    }

    /** Tells the group's members (and anyone extra, e.g. a new invitee) that the group changed. */
    void publishGroupsChanged(UUID groupId, Set<UUID> extraRecipients) {
        Set<UUID> recipients = new HashSet<>(groupMemberRepository.findUserIdsByGroupId(groupId));
        recipients.addAll(extraRecipients);
        eventPublisher.publishEvent(SocialEvent.groupsChanged(recipients));
    }

    private String newUniqueInviteCode() {
        String code;
        do {
            code = inviteCodeGenerator.generate();
        } while (friendGroupRepository.existsByInviteCode(code));
        return code;
    }

    private List<GroupResponse> toResponses(List<FriendGroup> groups) {
        if (groups.isEmpty()) return List.of();
        List<UUID> groupIds = groups.stream().map(FriendGroup::getId).toList();
        Map<UUID, List<GroupMember>> members = groupMemberRepository.findAllWithProfileByGroupIdIn(groupIds).stream()
                .collect(Collectors.groupingBy(GroupMember::getGroupId));
        Map<UUID, List<UUID>> invited = groupInvitationRepository.findAllByGroupIdIn(groupIds).stream()
                .collect(Collectors.groupingBy(GroupInvitation::getGroupId,
                        Collectors.mapping(GroupInvitation::getInviteeId, Collectors.toList())));
        return groups.stream()
                .map(group -> new GroupResponse(group.getId(), group.getName(), group.getInviteCode(), group.getCreatedAt(),
                        members.getOrDefault(group.getId(), List.of()).stream().sorted(OWNER_FIRST).map(this::toMemberResponse).toList(),
                        invited.getOrDefault(group.getId(), List.of())))
                .toList();
    }

    private GroupMemberResponse toMemberResponse(GroupMember member) {
        Profile profile = member.getProfile();
        return new GroupMemberResponse(profile.getId(), profile.getUsername(), profile.getDisplayName(),
                presenceService.effectivePresence(profile), profile.getLastSeenAt(), member.getRole(), member.getJoinedAt());
    }
}
