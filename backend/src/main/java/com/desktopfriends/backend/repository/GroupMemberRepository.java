package com.desktopfriends.backend.repository;

import com.desktopfriends.backend.entity.GroupMember;
import com.desktopfriends.backend.entity.GroupMemberId;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GroupMemberRepository extends JpaRepository<GroupMember, GroupMemberId> {

    boolean existsByGroupIdAndUserId(UUID groupId, UUID userId);

    Optional<GroupMember> findByGroupIdAndUserId(UUID groupId, UUID userId);

    /** The longest-standing member (who takes over when the owner leaves). */
    Optional<GroupMember> findFirstByGroupIdOrderByJoinedAtAscUserIdAsc(UUID groupId);

    @Query("select m.userId from GroupMember m where m.groupId = :groupId")
    List<UUID> findUserIdsByGroupId(@Param("groupId") UUID groupId);

    /** Members of these groups with their profiles loaded. */
    @Query("select m from GroupMember m join fetch m.profile where m.groupId in :groupIds")
    List<GroupMember> findAllWithProfileByGroupIdIn(@Param("groupIds") Collection<UUID> groupIds);

    /** Everyone who shares at least one group with the user. */
    @Query("""
            select distinct other.userId from GroupMember mine, GroupMember other
            where mine.groupId = other.groupId and mine.userId = :userId and other.userId <> :userId
            """)
    List<UUID> findCoMemberIds(@Param("userId") UUID userId);

    /** Adds a member unless they are already in the group (joining twice is harmless). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            insert into group_members (group_id, user_id, role, joined_at)
            values (:groupId, :userId, 'member', now())
            on conflict (group_id, user_id) do nothing
            """, nativeQuery = true)
    int insertMemberIfAbsent(@Param("groupId") UUID groupId, @Param("userId") UUID userId);
}
