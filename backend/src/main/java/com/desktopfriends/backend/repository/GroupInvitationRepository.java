package com.desktopfriends.backend.repository;

import com.desktopfriends.backend.entity.GroupInvitation;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GroupInvitationRepository extends JpaRepository<GroupInvitation, UUID> {

    boolean existsByGroupIdAndInviteeId(UUID groupId, UUID inviteeId);

    Optional<GroupInvitation> findByIdAndInviteeId(UUID id, UUID inviteeId);

    List<GroupInvitation> findAllByGroupIdIn(Collection<UUID> groupIds);

    /** Invitations sent to the user, newest first, with the group and inviter loaded. */
    @Query("""
            select i from GroupInvitation i
            join fetch i.group
            left join fetch i.inviter
            where i.inviteeId = :inviteeId
            order by i.createdAt desc
            """)
    List<GroupInvitation> findAllForInvitee(@Param("inviteeId") UUID inviteeId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from GroupInvitation i where i.groupId = :groupId and i.inviteeId = :inviteeId")
    int deleteByGroupIdAndInviteeId(@Param("groupId") UUID groupId, @Param("inviteeId") UUID inviteeId);
}
