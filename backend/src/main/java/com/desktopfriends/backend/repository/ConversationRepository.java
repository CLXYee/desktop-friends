package com.desktopfriends.backend.repository;

import com.desktopfriends.backend.entity.Conversation;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    /** A group's chat (the database creates it with the group). */
    Optional<Conversation> findByGroupId(UUID groupId);

    List<Conversation> findAllByGroupIdIn(Collection<UUID> groupIds);

    @Query("""
            select c from Conversation c
            where c.kind = com.desktopfriends.backend.entity.ConversationKind.DIRECT
              and ((c.directUserA = :a and c.directUserB = :b) or (c.directUserA = :b and c.directUserB = :a))
            """)
    Optional<Conversation> findDirectBetween(@Param("a") UUID a, @Param("b") UUID b);

    /** Every chat the user is in. */
    @Query("select c from Conversation c where c.id in (select m.conversationId from ConversationMember m where m.userId = :userId)")
    List<Conversation> findAllByMemberId(@Param("userId") UUID userId);

    /** Opens the direct chat between two people unless it exists (two people opening it at once is fine). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            insert into conversations (kind, direct_user_a, direct_user_b, created_at)
            values ('direct', :a, :b, :createdAt)
            on conflict do nothing
            """, nativeQuery = true)
    int insertDirectIfAbsent(@Param("a") UUID a, @Param("b") UUID b, @Param("createdAt") Instant createdAt);
}
