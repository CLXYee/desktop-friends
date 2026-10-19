package com.desktopfriends.backend.repository;

import com.desktopfriends.backend.entity.Message;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MessageRepository extends JpaRepository<Message, Long> {

    /** The newest messages of a chat, newest first. */
    @Query("select m from Message m left join fetch m.sender where m.conversationId = :conversationId order by m.id desc")
    List<Message> findLatest(@Param("conversationId") UUID conversationId, Limit limit);

    /** The page before a cursor (an older message id), newest first. */
    @Query("""
            select m from Message m left join fetch m.sender
            where m.conversationId = :conversationId and m.id < :beforeId
            order by m.id desc
            """)
    List<Message> findOlderThan(@Param("conversationId") UUID conversationId, @Param("beforeId") long beforeId, Limit limit);

    @Query("select m from Message m left join fetch m.sender where m.id in :ids")
    List<Message> findAllWithSenderByIdIn(@Param("ids") Collection<Long> ids);

    /** How many messages someone sent since a moment (the rate limit). */
    @Query("""
            select count(m) from Message m
            where m.senderId = :senderId and m.kind = com.desktopfriends.backend.entity.MessageKind.TEXT
              and m.createdAt > :since
            """)
    long countSentSince(@Param("senderId") UUID senderId, @Param("since") Instant since);

    /** The last message of each of these chats (for the chat list). */
    @Query(value = """
            select distinct on (conversation_id) * from messages
            where conversation_id in (:conversationIds)
            order by conversation_id, id desc
            """, nativeQuery = true)
    List<Message> findLastOfEach(@Param("conversationIds") Collection<UUID> conversationIds);

    /** Unread messages per chat for a user: written by others after they last read the chat. */
    @Query(value = """
            select member.conversation_id as conversationId, count(message.id) as unread
            from conversation_members member
            join messages message on message.conversation_id = member.conversation_id
              and message.created_at > member.last_read_at
              and message.kind = 'text'
              and message.deleted_at is null
              and message.sender_id is distinct from member.user_id
            where member.user_id = :userId
            group by member.conversation_id
            """, nativeQuery = true)
    List<UnreadCount> countUnreadByConversation(@Param("userId") UUID userId);

    interface UnreadCount {
        UUID getConversationId();

        long getUnread();
    }
}
