package com.desktopfriends.backend.service;

import com.desktopfriends.backend.dto.response.ConversationResponse;
import com.desktopfriends.backend.dto.response.ConversationResponse.GroupSummary;
import com.desktopfriends.backend.dto.response.FriendProfileResponse;
import com.desktopfriends.backend.dto.response.MessageResponse;
import com.desktopfriends.backend.dto.response.TypingEventResponse;
import com.desktopfriends.backend.entity.Conversation;
import com.desktopfriends.backend.entity.ConversationMember;
import com.desktopfriends.backend.entity.FriendGroup;
import com.desktopfriends.backend.entity.Message;
import com.desktopfriends.backend.entity.PresenceStatus;
import com.desktopfriends.backend.entity.Profile;
import com.desktopfriends.backend.event.SocialEvent;
import com.desktopfriends.backend.exception.BadRequestException;
import com.desktopfriends.backend.exception.NotFoundException;
import com.desktopfriends.backend.mapper.MessageMapper;
import com.desktopfriends.backend.repository.ConversationMemberRepository;
import com.desktopfriends.backend.repository.ConversationRepository;
import com.desktopfriends.backend.repository.FriendGroupRepository;
import com.desktopfriends.backend.repository.FriendshipRepository;
import com.desktopfriends.backend.repository.MessageRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The user's chats: the list (with last message and unread count), opening a direct chat with a friend,
 * marking read, muting, and typing indicators. Only members can see or use a chat; to anyone else it looks
 * like it doesn't exist.
 */
@Service
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final ConversationMemberRepository conversationMemberRepository;
    private final MessageRepository messageRepository;
    private final FriendGroupRepository friendGroupRepository;
    private final FriendshipRepository friendshipRepository;
    private final PresenceService presenceService;
    private final MessageMapper messageMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    public ConversationService(ConversationRepository conversationRepository, ConversationMemberRepository conversationMemberRepository,
            MessageRepository messageRepository, FriendGroupRepository friendGroupRepository, FriendshipRepository friendshipRepository,
            PresenceService presenceService, MessageMapper messageMapper, ApplicationEventPublisher eventPublisher, Clock clock) {
        this.conversationRepository = conversationRepository;
        this.conversationMemberRepository = conversationMemberRepository;
        this.messageRepository = messageRepository;
        this.friendGroupRepository = friendGroupRepository;
        this.friendshipRepository = friendshipRepository;
        this.presenceService = presenceService;
        this.messageMapper = messageMapper;
        this.eventPublisher = eventPublisher;
        this.clock = clock;
    }

    /** Every chat the user is in, the most recently active first. */
    @Transactional(readOnly = true)
    public List<ConversationResponse> listConversations(UUID userId) {
        return toResponses(userId, conversationRepository.findAllByMemberId(userId));
    }

    @Transactional(readOnly = true)
    public ConversationResponse getConversation(UUID userId, UUID conversationId) {
        requireMembership(conversationId, userId);
        return toResponses(userId, List.of(findConversation(conversationId))).getFirst();
    }

    /** Opens the direct chat with a friend, creating it the first time. There is only ever one per pair. */
    @Transactional
    public ConversationResponse openDirectConversation(UUID userId, UUID friendId) {
        if (userId.equals(friendId)) {
            throw new BadRequestException("That's you! Pick a friend to message.");
        }
        if (!friendshipRepository.areFriends(userId, friendId)) {
            throw new BadRequestException("You can only message your friends.");
        }
        Instant now = clock.instant();
        conversationRepository.insertDirectIfAbsent(userId, friendId, now);
        Conversation conversation = conversationRepository.findDirectBetween(userId, friendId)
                .orElseThrow(() -> new IllegalStateException("The direct chat wasn't created"));
        conversationMemberRepository.insertMemberIfAbsent(conversation.getId(), userId, now);
        conversationMemberRepository.insertMemberIfAbsent(conversation.getId(), friendId, now);
        return toResponses(userId, List.of(conversation)).getFirst();
    }

    /** Everything in the chat up to now counts as read. */
    @Transactional
    public void markRead(UUID userId, UUID conversationId) {
        // Nothing changed: either already read up to now, or not (any more) in the chat.
        if (conversationMemberRepository.markReadUpTo(conversationId, userId, clock.instant()) == 0) {
            requireMembership(conversationId, userId);
        }
    }

    @Transactional
    public void setMuted(UUID userId, UUID conversationId, boolean muted) {
        if (conversationMemberRepository.updateMuted(conversationId, userId, muted) == 0) {
            throw new NotFoundException("That chat isn't available. You may have left it.");
        }
    }

    /** Tells the others in the chat that the user is typing. Nothing is stored. */
    @Transactional(readOnly = true)
    public void sendTyping(UUID userId, UUID conversationId) {
        ConversationMember membership = requireMembership(conversationId, userId);
        Set<UUID> others = new HashSet<>(conversationMemberRepository.findUserIdsByConversationId(conversationId));
        others.remove(userId);
        eventPublisher.publishEvent(new SocialEvent(others, SocialEvent.TYPING,
                new TypingEventResponse(conversationId, MessageMapper.toChatUser(membership.getProfile()))));
    }

    /** The user's place in a chat; a chat they're not in is reported as unavailable. */
    @Transactional(readOnly = true)
    public ConversationMember requireMembership(UUID conversationId, UUID userId) {
        return conversationMemberRepository.findByConversationIdAndUserId(conversationId, userId)
                .orElseThrow(() -> new NotFoundException("That chat isn't available. You may have left it."));
    }

    Conversation findConversation(UUID conversationId) {
        return conversationRepository.findById(conversationId)
                .orElseThrow(() -> new NotFoundException("That chat isn't available. You may have left it."));
    }

    /** Tells every member of the chat about it on their live event stream. */
    void publishToMembers(UUID conversationId, String eventName, Object data) {
        eventPublisher.publishEvent(new SocialEvent(
                Set.copyOf(conversationMemberRepository.findUserIdsByConversationId(conversationId)), eventName, data));
    }

    private List<ConversationResponse> toResponses(UUID userId, List<Conversation> conversations) {
        if (conversations.isEmpty()) return List.of();
        List<UUID> ids = conversations.stream().map(Conversation::getId).toList();
        Map<UUID, List<ConversationMember>> members = conversationMemberRepository.findAllWithProfileByConversationIdIn(ids).stream()
                .collect(Collectors.groupingBy(ConversationMember::getConversationId));
        Map<UUID, FriendGroup> groups = friendGroupRepository.findAllById(
                        conversations.stream().map(Conversation::getGroupId).filter(java.util.Objects::nonNull).toList())
                .stream().collect(Collectors.toMap(FriendGroup::getId, Function.identity()));
        List<Message> lastMessages = messageRepository.findLastOfEach(ids);
        Map<UUID, MessageResponse> lastByConversation = messageMapper.toResponses(lastMessages).stream()
                .collect(Collectors.toMap(MessageResponse::conversationId, Function.identity()));
        Map<UUID, Long> unread = messageRepository.countUnreadByConversation(userId).stream()
                .collect(Collectors.toMap(MessageRepository.UnreadCount::getConversationId, MessageRepository.UnreadCount::getUnread));
        Set<UUID> friendIds = new HashSet<>(friendshipRepository.findFriendIds(userId));

        return conversations.stream()
                .map(conversation -> toResponse(userId, conversation, members.getOrDefault(conversation.getId(), List.of()),
                        groups.get(conversation.getGroupId()), lastByConversation.get(conversation.getId()),
                        unread.getOrDefault(conversation.getId(), 0L), friendIds))
                .sorted(Comparator.comparing(ConversationService::activity).reversed())
                .toList();
    }

    private ConversationResponse toResponse(UUID userId, Conversation conversation, List<ConversationMember> members,
            FriendGroup group, MessageResponse lastMessage, long unreadCount, Set<UUID> friendIds) {
        boolean muted = members.stream().filter(member -> member.getUserId().equals(userId)).anyMatch(ConversationMember::isMuted);
        if (!conversation.isDirect()) {
            String title = group == null ? "Group" : group.getName();
            String characterId = group == null ? null : group.getCharacterId();
            GroupSummary summary = group == null ? null : new GroupSummary(group.getId(), group.getDescription(), members.size());
            return new ConversationResponse(conversation.getId(), conversation.getKind(), title, characterId, summary, null, true,
                    lastMessage, conversation.getLastMessageAt(), unreadCount, muted, conversation.getCreatedAt());
        }
        UUID otherId = conversation.otherParticipant(userId);
        Profile other = members.stream().filter(member -> member.getUserId().equals(otherId)).map(ConversationMember::getProfile)
                .findFirst().orElse(null);
        boolean isFriend = friendIds.contains(otherId);
        FriendProfileResponse partner = other == null ? null
                : isFriend ? presenceService.toFriendProfile(other)
                // No longer friends: name and avatar only, not their status.
                : new FriendProfileResponse(other.getId(), other.getUsername(), other.getDisplayName(), PresenceStatus.OFFLINE, null,
                        other.getCharacterId());
        return new ConversationResponse(conversation.getId(), conversation.getKind(),
                other == null ? "Deleted account" : other.getDisplayName(), other == null ? null : other.getCharacterId(),
                null, partner, isFriend, lastMessage, conversation.getLastMessageAt(), unreadCount, muted, conversation.getCreatedAt());
    }

    private static Instant activity(ConversationResponse conversation) {
        return conversation.lastMessageAt() != null ? conversation.lastMessageAt() : conversation.createdAt();
    }
}
