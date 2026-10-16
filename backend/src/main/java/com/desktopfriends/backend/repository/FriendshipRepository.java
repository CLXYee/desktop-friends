package com.desktopfriends.backend.repository;

import com.desktopfriends.backend.entity.Friendship;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FriendshipRepository extends JpaRepository<Friendship, UUID> {

    /** Every friendship and request the user is part of, with both profiles loaded. */
    @Query("""
            select f from Friendship f
            join fetch f.requester
            join fetch f.addressee
            where f.requester.id = :userId or f.addressee.id = :userId
            order by f.createdAt desc
            """)
    List<Friendship> findAllInvolving(@Param("userId") UUID userId);

    /** The row between two people (there is at most one, whoever asked first), locked for changing it. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select f from Friendship f
            where (f.requester.id = :a and f.addressee.id = :b) or (f.requester.id = :b and f.addressee.id = :a)
            """)
    Optional<Friendship> findBetweenForUpdate(@Param("a") UUID a, @Param("b") UUID b);

    @Query("""
            select count(f) > 0 from Friendship f
            where f.status = com.desktopfriends.backend.entity.FriendshipStatus.ACCEPTED
              and ((f.requester.id = :a and f.addressee.id = :b) or (f.requester.id = :b and f.addressee.id = :a))
            """)
    boolean areFriends(@Param("a") UUID a, @Param("b") UUID b);

    /** The ids of the user's friends (accepted only). */
    @Query("""
            select case when f.requester.id = :userId then f.addressee.id else f.requester.id end
            from Friendship f
            where f.status = com.desktopfriends.backend.entity.FriendshipStatus.ACCEPTED
              and (f.requester.id = :userId or f.addressee.id = :userId)
            """)
    List<UUID> findFriendIds(@Param("userId") UUID userId);
}
