package com.desktopfriends.backend.repository;

import com.desktopfriends.backend.entity.ConversationMember;
import com.desktopfriends.backend.entity.ConversationMemberId;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConversationMemberRepository extends JpaRepository<ConversationMember, ConversationMemberId> {

    Optional<ConversationMember> findByConversationIdAndUserId(UUID conversationId, UUID userId);

    @Query("select m.userId from ConversationMember m where m.conversationId = :conversationId")
    List<UUID> findUserIdsByConversationId(@Param("conversationId") UUID conversationId);

    /** Members of these chats with their profiles loaded. */
    @Query("select m from ConversationMember m join fetch m.profile where m.conversationId in :conversationIds")
    List<ConversationMember> findAllWithProfileByConversationIdIn(@Param("conversationIds") Collection<UUID> conversationIds);

    /**
     * Moves where the user has read up to (never backwards). One statement, so it can't fail if they leave the
     * chat at the same moment: it then changes nothing. Returns the rows changed.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update ConversationMember m set m.lastReadAt = :at
            where m.conversationId = :conversationId and m.userId = :userId and m.lastReadAt < :at
            """)
    int markReadUpTo(@Param("conversationId") UUID conversationId, @Param("userId") UUID userId, @Param("at") Instant at);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update ConversationMember m set m.muted = :muted where m.conversationId = :conversationId and m.userId = :userId")
    int updateMuted(@Param("conversationId") UUID conversationId, @Param("userId") UUID userId, @Param("muted") boolean muted);

    /** Adds someone to a chat unless they're in it already. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            insert into conversation_members (conversation_id, user_id, last_read_at, joined_at)
            values (:conversationId, :userId, :at, :at)
            on conflict (conversation_id, user_id) do nothing
            """, nativeQuery = true)
    int insertMemberIfAbsent(@Param("conversationId") UUID conversationId, @Param("userId") UUID userId, @Param("at") Instant at);
}
