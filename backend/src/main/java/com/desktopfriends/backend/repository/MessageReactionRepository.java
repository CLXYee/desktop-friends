package com.desktopfriends.backend.repository;

import com.desktopfriends.backend.entity.MessageReaction;
import com.desktopfriends.backend.entity.MessageReactionId;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MessageReactionRepository extends JpaRepository<MessageReaction, MessageReactionId> {

    List<MessageReaction> findAllByMessageIdIn(Collection<Long> messageIds);

    @Modifying(flushAutomatically = true)
    @Query("delete from MessageReaction r where r.messageId = :messageId")
    int deleteAllByMessageId(@Param("messageId") Long messageId);
}
