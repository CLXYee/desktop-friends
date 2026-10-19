package com.desktopfriends.backend.mapper;

import com.desktopfriends.backend.dto.response.ChatUserResponse;
import com.desktopfriends.backend.dto.response.MessageResponse;
import com.desktopfriends.backend.dto.response.ReactionResponse;
import com.desktopfriends.backend.dto.response.ReplyPreviewResponse;
import com.desktopfriends.backend.entity.Message;
import com.desktopfriends.backend.entity.MessageReaction;
import com.desktopfriends.backend.entity.Profile;
import com.desktopfriends.backend.repository.MessageReactionRepository;
import com.desktopfriends.backend.repository.MessageRepository;
import com.desktopfriends.backend.service.MessageService;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Turns messages into what the app receives: with their sender, the message they reply to and their
 * reactions, each loaded for a whole page at once.
 */
@Component
public class MessageMapper {

    private static final int REPLY_PREVIEW_LENGTH = 120;

    private final MessageRepository messageRepository;
    private final MessageReactionRepository messageReactionRepository;

    public MessageMapper(MessageRepository messageRepository, MessageReactionRepository messageReactionRepository) {
        this.messageRepository = messageRepository;
        this.messageReactionRepository = messageReactionRepository;
    }

    public static ChatUserResponse toChatUser(Profile profile) {
        return profile == null ? null
                : new ChatUserResponse(profile.getId(), profile.getUsername(), profile.getDisplayName(), profile.getCharacterId());
    }

    public MessageResponse toResponse(Message message) {
        return toResponses(List.of(message)).getFirst();
    }

    /** Converts messages in the order given. */
    public List<MessageResponse> toResponses(List<Message> messages) {
        if (messages.isEmpty()) return List.of();
        List<Long> ids = messages.stream().map(Message::getId).toList();
        Map<Long, List<MessageReaction>> reactions = messageReactionRepository.findAllByMessageIdIn(ids).stream()
                .collect(Collectors.groupingBy(MessageReaction::getMessageId));
        Set<Long> replyIds = messages.stream().map(Message::getReplyToId).filter(Objects::nonNull).collect(Collectors.toSet());
        Map<Long, Message> replies = replyIds.isEmpty() ? Map.of()
                : messageRepository.findAllWithSenderByIdIn(replyIds).stream().collect(Collectors.toMap(Message::getId, Function.identity()));
        return messages.stream()
                .map(message -> toResponse(message, reactions.getOrDefault(message.getId(), List.of()),
                        message.getReplyToId() == null ? null : replies.get(message.getReplyToId())))
                .toList();
    }

    private static MessageResponse toResponse(Message message, List<MessageReaction> reactions, Message repliedTo) {
        return new MessageResponse(message.getId(), message.getConversationId(), toChatUser(message.getSender()),
                message.getBody(), message.getKind(), toReplyPreview(repliedTo), message.getCreatedAt(), message.getEditedAt(),
                message.isDeleted(), toReactions(reactions));
    }

    private static ReplyPreviewResponse toReplyPreview(Message repliedTo) {
        if (repliedTo == null) return null;
        String senderName = repliedTo.getSender() == null ? "Someone" : repliedTo.getSender().getDisplayName();
        String body = repliedTo.getBody();
        if (body.codePointCount(0, body.length()) > REPLY_PREVIEW_LENGTH) {
            body = body.substring(0, body.offsetByCodePoints(0, REPLY_PREVIEW_LENGTH)) + "…";
        }
        return new ReplyPreviewResponse(repliedTo.getId(), senderName, body, repliedTo.isDeleted());
    }

    /** One entry per emoji, in the order of the reaction picker. */
    private static List<ReactionResponse> toReactions(List<MessageReaction> reactions) {
        Map<String, List<UUID>> byEmoji = new LinkedHashMap<>();
        reactions.stream()
                .sorted(Comparator.comparingInt((MessageReaction reaction) -> pickerPosition(reaction.getEmoji()))
                        .thenComparing(reaction -> reaction.getUserId().toString()))
                .forEach(reaction -> byEmoji.computeIfAbsent(reaction.getEmoji(), emoji -> new java.util.ArrayList<>()).add(reaction.getUserId()));
        return byEmoji.entrySet().stream().map(entry -> new ReactionResponse(entry.getKey(), List.copyOf(entry.getValue()))).toList();
    }

    private static int pickerPosition(String emoji) {
        int position = MessageService.REACTIONS.indexOf(emoji);
        return position < 0 ? Integer.MAX_VALUE : position;
    }
}
