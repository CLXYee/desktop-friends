package com.desktopfriends.backend.service;

import com.desktopfriends.backend.dto.request.UpdateGroupRequest;
import com.desktopfriends.backend.dto.response.GroupMemberResponse;
import com.desktopfriends.backend.dto.response.GroupResponse;
import com.desktopfriends.backend.dto.response.InviteCodeResponse;
import com.desktopfriends.backend.dto.response.JoinGroupResponse;
import com.desktopfriends.backend.entity.Conversation;
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
import com.desktopfriends.backend.repository.ConversationRepository;
import com.desktopfriends.backend.repository.FriendGroupRepository;
import com.desktopfriends.backend.repository.FriendshipRepository;
import com.desktopfriends.backend.repository.GroupInvitationRepository;
import com.desktopfriends.backend.repository.GroupMemberRepository;
import com.desktopfriends.backend.repository.ProfileRepository;
import com.desktopfriends.backend.util.CharacterCatalog;
import java.time.Clock;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Groups: creating, editing, inviting friends, joining by invite link, leaving, and resetting the link. Every
 * member may invite their friends; only the owner may edit the group or reset the link. When the owner
 * leaves, the longest-standing member takes over; the last member to leave deletes the group. Each group has
 * one chat, which the database keeps in step with the members; this service posts notes in it ("Ben joined").
 */
@Service
public class GroupService {

    public static final int GROUP_NAME_MAX = 40;
    public static final int DESCRIPTION_MAX = 200;
    private static final Comparator<GroupMember> OWNER_FIRST = Comparator
            .comparing((GroupMember member) -> !member.isOwner())
            .thenComparing(GroupMember::getJoinedAt)
            .thenComparing(GroupMember::getUserId);

    private final FriendGroupRepository friendGroupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupInvitationRepository groupInvitationRepository;
    private final FriendshipRepository friendshipRepository;
    private final ProfileRepository profileRepository;
    private final ConversationRepository conversationRepository;
    private final PresenceService presenceService;
    private final MessageService messageService;
    private final InviteCodeGenerator inviteCodeGenerator;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    public GroupService(FriendGroupRepository friendGroupRepository, GroupMemberRepository groupMemberRepository,
            GroupInvitationRepository groupInvitationRepository, FriendshipRepository friendshipRepository,
            ProfileRepository profileRepository, ConversationRepository conversationRepository, PresenceService presenceService,
            MessageService messageService, InviteCodeGenerator inviteCodeGenerator, ApplicationEventPublisher eventPublisher, Clock clock) {
        this.friendGroupRepository = friendGroupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupInvitationRepository = groupInvitationRepository;
        this.friendshipRepository = friendshipRepository;
        this.profileRepository = profileRepository;
        this.conversationRepository = conversationRepository;
        this.presenceService = presenceService;
        this.messageService = messageService;
        this.inviteCodeGenerator = inviteCodeGenerator;
        this.eventPublisher = eventPublisher;
        this.clock = clock;
    }

    /** The groups the user belongs to (groups they are only invited to come from the invitations). */
    @Transactional(readOnly = true)
    public List<GroupResponse> listGroups(UUID userId) {
        return toResponses(friendGroupRepository.findAllByMemberId(userId));
    }

    /** Creates a group with the user as its owner; its chat is created with it. */
    @Transactional
    public GroupResponse createGroup(UUID userId, String name, String description, String characterId) {
        String cleanName = cleanName(name);
        String cleanDescription = cleanDescription(description == null ? "" : description);
        String character = characterId == null ? CharacterCatalog.DEFAULT_CHARACTER_ID : checkCharacter(characterId);
        Profile owner = findProfile(userId);
        FriendGroup group = friendGroupRepository.saveAndFlush(
                new FriendGroup(cleanName, cleanDescription, character, newUniqueInviteCode(), userId, clock.instant()));
        groupMemberRepository.saveAndFlush(new GroupMember(group.getId(), owner, GroupRole.OWNER, clock.instant()));
        messageService.postGroupNotice(group.getId(), userId, owner.getDisplayName() + " created the group.");
        eventPublisher.publishEvent(SocialEvent.groupsChanged(List.of(userId)));
        return toResponses(List.of(group)).getFirst();
    }

    /** Changes the group's name, description or character. Owner only. */
    @Transactional
    public GroupResponse updateGroup(UUID userId, UUID groupId, UpdateGroupRequest request) {
        groupMemberRepository.findByGroupIdAndUserId(groupId, userId)
                .filter(GroupMember::isOwner)
                .orElseThrow(() -> new ForbiddenException("Only the group's owner can change its details."));
        FriendGroup group = friendGroupRepository.findById(groupId)
                .orElseThrow(() -> new NotFoundException("That group no longer exists."));
        String newName = request.name() == null ? null : cleanName(request.name());
        boolean renamed = newName != null && !newName.equals(group.getName());
        group.updateDetails(newName,
                request.description() == null ? null : cleanDescription(request.description()),
                request.characterId() == null ? null : checkCharacter(request.characterId()));
        if (renamed) {
            messageService.postGroupNotice(groupId, userId, findProfile(userId).getDisplayName() + " renamed the group to “" + newName + "”.");
        }
        publishGroupsChanged(groupId, Set.of());
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
        boolean joined = groupMemberRepository.insertMemberIfAbsent(group.getId(), userId) > 0;
        groupInvitationRepository.deleteByGroupIdAndInviteeId(group.getId(), userId);
        if (joined) announceJoin(group.getId(), userId);
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
        String leaverName = findProfile(userId).getDisplayName();

        groupMemberRepository.delete(membership);
        groupMemberRepository.flush();
        Optional<GroupMember> successor = groupMemberRepository.findFirstByGroupIdOrderByJoinedAtAscUserIdAsc(groupId);
        if (successor.isEmpty()) {
            friendGroupRepository.deleteGroupById(groupId);
        } else {
            messageService.postGroupNotice(groupId, userId, leaverName + " left the group.");
            if (membership.isOwner()) {
                GroupMember newOwner = successor.get();
                newOwner.promoteToOwner();
                messageService.postGroupNotice(groupId, newOwner.getUserId(), findProfile(newOwner.getUserId()).getDisplayName() + " is now the owner.");
            }
        }
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

    /** Posts "Ben joined the group." in the group's chat. */
    void announceJoin(UUID groupId, UUID userId) {
        messageService.postGroupNotice(groupId, userId, findProfile(userId).getDisplayName() + " joined the group.");
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

    private Profile findProfile(UUID userId) {
        return profileRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("Your profile is missing. Log out and in again."));
    }

    private static String cleanName(String name) {
        String clean = name == null ? "" : name.strip();
        if (clean.isEmpty() || clean.codePointCount(0, clean.length()) > GROUP_NAME_MAX) {
            throw new BadRequestException("Group names are 1–" + GROUP_NAME_MAX + " characters.");
        }
        return clean;
    }

    private static String cleanDescription(String description) {
        String clean = description.strip();
        if (clean.codePointCount(0, clean.length()) > DESCRIPTION_MAX) {
            throw new BadRequestException("Descriptions are at most " + DESCRIPTION_MAX + " characters.");
        }
        return clean;
    }

    private static String checkCharacter(String characterId) {
        if (!CharacterCatalog.isKnown(characterId)) {
            throw new BadRequestException("Unknown character. Pick one of " + String.join(", ", CharacterCatalog.CHARACTER_IDS) + ".");
        }
        return characterId;
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
        Map<UUID, UUID> chats = conversationRepository.findAllByGroupIdIn(groupIds).stream()
                .collect(Collectors.toMap(Conversation::getGroupId, Conversation::getId));
        return groups.stream()
                .map(group -> new GroupResponse(group.getId(), group.getName(), group.getDescription(), group.getCharacterId(),
                        group.getInviteCode(), group.getCreatedAt(), chats.get(group.getId()),
                        members.getOrDefault(group.getId(), List.of()).stream().sorted(OWNER_FIRST).map(this::toMemberResponse).toList(),
                        invited.getOrDefault(group.getId(), List.of())))
                .toList();
    }

    private GroupMemberResponse toMemberResponse(GroupMember member) {
        Profile profile = member.getProfile();
        return new GroupMemberResponse(profile.getId(), profile.getUsername(), profile.getDisplayName(),
                presenceService.effectivePresence(profile), profile.getLastSeenAt(), member.getRole(), member.getJoinedAt(),
                profile.getCharacterId());
    }
}
