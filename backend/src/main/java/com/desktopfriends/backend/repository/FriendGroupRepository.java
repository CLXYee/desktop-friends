package com.desktopfriends.backend.repository;

import com.desktopfriends.backend.entity.FriendGroup;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FriendGroupRepository extends JpaRepository<FriendGroup, UUID> {

    Optional<FriendGroup> findByInviteCode(String inviteCode);

    boolean existsByInviteCode(String inviteCode);

    /** The groups the user belongs to, oldest first. */
    @Query("""
            select g from FriendGroup g
            where g.id in (select m.groupId from GroupMember m where m.userId = :userId)
            order by g.createdAt, g.id
            """)
    List<FriendGroup> findAllByMemberId(@Param("userId") UUID userId);

    /** Deletes a group; the database removes its members and invitations with it. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from FriendGroup g where g.id = :groupId")
    void deleteGroupById(@Param("groupId") UUID groupId);
}
