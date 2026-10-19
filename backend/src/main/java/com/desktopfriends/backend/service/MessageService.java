package com.desktopfriends.backend.service;

import com.desktopfriends.backend.dto.response.MessagePageResponse;
import com.desktopfriends.backend.dto.response.MessageResponse;
import com.desktopfriends.backend.entity.Conversation;
import com.desktopfriends.backend.entity.ConversationMember;
import com.desktopfriends.backend.entity.Message;
import com.desktopfriends.backend.entity.MessageKind;
import com.desktopfriends.backend.entity.MessageReaction;
import com.desktopfriends.backend.entity.MessageReactionId;
import com.desktopfriends.backend.entity.Profile;
import com.desktopfriends.backend.event.SocialEvent;
import com.desktopfriends.backend.exception.BadRequestException;
import com.desktopfriends.backend.exception.ForbiddenException;
import com.desktopfriends.backend.exception.NotFoundException;
import com.desktopfriends.backend.exception.TooManyRequestsException;
import com.desktopfriends.backend.mapper.MessageMapper;
import com.desktopfriends.backend.repository.ConversationMemberRepository;
import com.desktopfriends.backend.repository.ConversationRepository;
import com.desktopfriends.backend.repository.FriendshipRepository;
import com.desktopfriends.backend.repository.MessageReactionRepository;
import com.desktopfriends.backend.repository.MessageRepository;
import com.desktopfriends.backend.repository.ProfileRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Chat messages: reading a chat page by page, sending (members only; in a direct chat only to a friend;
 * rate-limited), editing and deleting your own, reactions, and the app's notes in group chats. Every change
 * is pushed to the chat's members on their live event stream once it is committed.
 */
@Service
public class MessageService {

    /** Messages per page; older pages are fetched with the id of the oldest message shown. */
    public static final int PAGE_SIZE = 50;
    public static final int MESSAGE_MAX_LENGTH = 2000;
    /** At most this many messages per person within RATE_LIMIT_WINDOW, across all chats. */
    public static final int RATE_LIMIT_MESSAGES = 10;
    public static final Duration RATE_LIMIT_WINDOW = Duration.ofSeconds(10);
    /** The reactions the app offers, in picker order. */
    public static final List<String> REACTIONS = List.of("👍", "❤️", "😂", "😮", "😢", "🎉");

    private final MessageRepository messageRepository;
    private final MessageReactionRepository messageReactionRepository;
    private final ConversationRepository conversationRepository;
    private final ConversationMemberRepository conversationMemberRepository;
    private final FriendshipRepository friendshipRepository;
    private final ProfileRepository profileRepository;
    private final ConversationService conversationService;
    private final MessageMapper messageMapper;
    private final Clock clock;

    public MessageService(MessageRepository messageRepository, MessageReactionRepository messageReactionRepository,
            ConversationRepository conversationRepository, ConversationMemberRepository conversationMemberRepository,
            FriendshipRepository friendshipRepository, ProfileRepository profileRepository,
            ConversationService conversationService, MessageMapper messageMapper, Clock clock) {
        this.messageRepository = messageRepository;
        this.messageReactionRepository = messageReactionRepository;
        this.conversationRepository = conversationRepository;
        this.conversationMemberRepository = conversationMemberRepository;
        this.friendshipRepository = friendshipRepository;
        this.profileRepository = profileRepository;
        this.conversationService = conversationService;
        this.messageMapper = messageMapper;
        this.clock = clock;
    }

    /**
     * A page of the chat, oldest first: the newest messages, or with beforeId the ones just older than it.
     * limit is at most PAGE_SIZE.
     */
    @Transactional(readOnly = true)
    public MessagePageResponse listMessages(UUID userId, UUID conversationId, Long beforeId, Integer limit) {
        conversationService.requireMembership(conversationId, userId);
        int size = limit == null ? PAGE_SIZE : Math.clamp(limit, 1, PAGE_SIZE);
        List<Message> page = beforeId == null
                ? messageRepository.findLatest(conversationId, Limit.of(size + 1))
                : messageRepository.findOlderThan(conversationId, beforeId, Limit.of(size + 1));
        boolean hasMore = page.size() > size;
        List<Message> shown = new ArrayList<>(page.subList(0, Math.min(size, page.size())));
        Collections.reverse(shown);
        Long nextCursor = hasMore ? shown.getFirst().getId() : null;
        return new MessagePageResponse(messageMapper.toResponses(shown), hasMore, nextCursor);
    }

    /** Sends a message, optionally replying to an earlier one of the same chat. */
    @Transactional
    public MessageResponse sendMessage(UUID userId, UUID conversationId, String body, Long replyToId) {
        ConversationMember membership = conversationService.requireMembership(conversationId, userId);
        Conversation conversation = conversationService.findConversation(conversationId);
        if (conversation.isDirect() && !friendshipRepository.areFriends(userId, conversation.otherParticipant(userId))) {
            throw new ForbiddenException("You can only message friends. Add them again to keep chatting.");
        }
        String text = cleanBody(body);
        Instant now = clock.instant();
        if (messageRepository.countSentSince(userId, now.minus(RATE_LIMIT_WINDOW)) >= RATE_LIMIT_MESSAGES) {
            throw new TooManyRequestsException("You're sending messages too fast. Wait a few seconds.");
        }
        if (replyToId != null && messageRepository.findById(replyToId)
                .filter(original -> original.getConversationId().equals(conversationId)).isEmpty()) {
            throw new BadRequestException("You can only reply to a message in this chat.");
        }

        Profile sender = membership.getProfile();
        Message message = messageRepository.saveAndFlush(new Message(conversationId, sender, text, MessageKind.TEXT, replyToId, now));
        conversation.recordMessageAt(now);
        MessageResponse response = messageMapper.toResponse(message);
        // Writing in a chat means you've seen what's in it.
        conversationMemberRepository.markReadUpTo(conversationId, userId, now);
        conversationService.publishToMembers(conversationId, SocialEvent.MESSAGE, response);
        return response;
    }

    @Transactional
    public MessageResponse editMessage(UUID userId, long messageId, String body) {
        Message message = findOwnMessage(userId, messageId, "You can only edit your own messages.");
        if (message.isDeleted()) throw new BadRequestException("That message was deleted.");
        message.edit(cleanBody(body), clock.instant());
        return publishUpdate(message);
    }

    /** Deletes the user's own message: its text and reactions go, a "message deleted" placeholder stays. */
    @Transactional
    public void deleteMessage(UUID userId, long messageId) {
        Message message = findOwnMessage(userId, messageId, "You can only delete your own messages.");
        if (message.isDeleted()) return;
        messageReactionRepository.deleteAllByMessageId(message.getId());
        message.delete(clock.instant());
        publishUpdate(message);
    }

    @Transactional
    public MessageResponse addReaction(UUID userId, long messageId, String emoji) {
        Message message = findReactableMessage(userId, messageId, emoji);
        MessageReactionId id = new MessageReactionId(message.getId(), userId, emoji);
        if (!messageReactionRepository.existsById(id)) {
            messageReactionRepository.saveAndFlush(new MessageReaction(message.getId(), userId, emoji, clock.instant()));
        }
        return publishUpdate(message);
    }

    @Transactional
    public MessageResponse removeReaction(UUID userId, long messageId, String emoji) {
        Message message = findReactableMessage(userId, messageId, emoji);
        messageReactionRepository.findById(new MessageReactionId(message.getId(), userId, emoji))
                .ifPresent(reaction -> {
                    messageReactionRepository.delete(reaction);
                    messageReactionRepository.flush();
                });
        return publishUpdate(message);
    }

    /** A note from the app in a group's chat, e.g. "Ben joined the group." */
    @Transactional
    public void postGroupNotice(UUID groupId, UUID actorId, String text) {
        conversationRepository.findByGroupId(groupId).ifPresent(conversation -> {
            Profile actor = actorId == null ? null : profileRepository.findById(actorId).orElse(null);
            Message notice = messageRepository.saveAndFlush(
                    new Message(conversation.getId(), actor, text, MessageKind.SYSTEM, null, clock.instant()));
            conversation.recordMessageAt(notice.getCreatedAt());
            conversationService.publishToMembers(conversation.getId(), SocialEvent.MESSAGE, messageMapper.toResponse(notice));
        });
    }

    private Message findMessageForMember(UUID userId, long messageId) {
        Message message = messageRepository.findById(messageId)
                .orElseThrow(() -> new NotFoundException("That message is no longer available."));
        conversationService.requireMembership(message.getConversationId(), userId);
        return message;
    }

    private Message findOwnMessage(UUID userId, long messageId, String notYoursMessage) {
        Message message = findMessageForMember(userId, messageId);
        if (message.getKind() != MessageKind.TEXT || !userId.equals(message.getSenderId())) {
            throw new ForbiddenException(notYoursMessage);
        }
        return message;
    }

    private Message findReactableMessage(UUID userId, long messageId, String emoji) {
        if (!REACTIONS.contains(emoji)) {
            throw new BadRequestException("Pick one of the reactions: " + String.join(" ", REACTIONS) + ".");
        }
        Message message = findMessageForMember(userId, messageId);
        if (message.isDeleted()) throw new BadRequestException("That message was deleted.");
        return message;
    }

    private MessageResponse publishUpdate(Message message) {
        MessageResponse response = messageMapper.toResponse(message);
        conversationService.publishToMembers(message.getConversationId(), SocialEvent.MESSAGE_UPDATED, response);
        return response;
    }

    /** Trims the message; 1–2000 characters. */
    static String cleanBody(String body) {
        String text = body == null ? "" : body.strip();
        if (text.isEmpty()) throw new BadRequestException("Write a message first.");
        if (text.codePointCount(0, text.length()) > MESSAGE_MAX_LENGTH) {
            throw new BadRequestException("Messages can be at most " + MESSAGE_MAX_LENGTH + " characters.");
        }
        return text;
    }
}
