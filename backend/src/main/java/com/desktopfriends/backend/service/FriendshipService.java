package com.desktopfriends.backend.service;

import com.desktopfriends.backend.dto.response.FriendListResponse;
import com.desktopfriends.backend.dto.response.FriendProfileResponse;
import com.desktopfriends.backend.dto.response.FriendRequestResponse;
import com.desktopfriends.backend.dto.response.FriendshipResponse;
import com.desktopfriends.backend.entity.Friendship;
import com.desktopfriends.backend.entity.PresenceStatus;
import com.desktopfriends.backend.entity.Profile;
import com.desktopfriends.backend.event.SocialEvent;
import com.desktopfriends.backend.exception.BadRequestException;
import com.desktopfriends.backend.exception.ConflictException;
import com.desktopfriends.backend.exception.NotFoundException;
import com.desktopfriends.backend.repository.FriendshipRepository;
import com.desktopfriends.backend.repository.ProfileRepository;
import com.desktopfriends.backend.util.AccountRules;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Friend requests and friendships. A request only reveals the requester to the person asked; the requester
 * sees the other person's name but not their status until they accept.
 */
@Service
public class FriendshipService {

    private final FriendshipRepository friendshipRepository;
    private final ProfileRepository profileRepository;
    private final PresenceService presenceService;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    public FriendshipService(FriendshipRepository friendshipRepository, ProfileRepository profileRepository,
            PresenceService presenceService, ApplicationEventPublisher eventPublisher, Clock clock) {
        this.friendshipRepository = friendshipRepository;
        this.profileRepository = profileRepository;
        this.presenceService = presenceService;
        this.eventPublisher = eventPublisher;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public FriendListResponse listFriendships(UUID userId) {
        List<FriendshipResponse> friends = new ArrayList<>();
        List<FriendshipResponse> incoming = new ArrayList<>();
        List<FriendshipResponse> outgoing = new ArrayList<>();
        for (Friendship friendship : friendshipRepository.findAllInvolving(userId)) {
            Profile other = friendship.otherThan(userId);
            if (friendship.isAccepted()) {
                friends.add(toResponse(friendship, "friend", presenceService.toFriendProfile(other)));
            } else if (friendship.getAddressee().getId().equals(userId)) {
                incoming.add(toResponse(friendship, "incoming", presenceService.toFriendProfile(other)));
            } else {
                // Asking someone doesn't let you see their status.
                FriendProfileResponse hidden = new FriendProfileResponse(
                        other.getId(), other.getUsername(), other.getDisplayName(), PresenceStatus.OFFLINE, null);
                outgoing.add(toResponse(friendship, "outgoing", hidden));
            }
        }
        return new FriendListResponse(friends, incoming, outgoing);
    }

    /**
     * Sends a friend request by username. If that person already asked the user, this accepts it instead.
     * Returns "pending" or "accepted".
     */
    @Transactional
    public FriendRequestResponse sendRequest(UUID userId, String username) {
        String name = AccountRules.normalizeUsername(username);
        Profile target = profileRepository.findByUsername(name)
                .orElseThrow(() -> new NotFoundException("No one has the username \"" + name + "\"."));
        if (target.getId().equals(userId)) {
            throw new BadRequestException("That's you! Add someone else.");
        }

        Optional<Friendship> existing = friendshipRepository.findBetweenForUpdate(userId, target.getId());
        if (existing.isPresent()) {
            Friendship friendship = existing.get();
            if (friendship.isAccepted()) {
                throw new ConflictException("You are already friends.");
            }
            if (friendship.getRequester().getId().equals(userId)) {
                throw new ConflictException("You already sent them a request.");
            }
            friendship.accept(clock.instant());
            publishFriendsChanged(userId, target.getId());
            return new FriendRequestResponse("accepted");
        }

        Profile requester = profileRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("Your profile is missing. Log out and in again."));
        try {
            friendshipRepository.saveAndFlush(new Friendship(requester, target, clock.instant()));
        } catch (DataIntegrityViolationException raced) {
            throw new ConflictException("A request between you two was just sent. Refresh and try again.");
        }
        publishFriendsChanged(userId, target.getId());
        return new FriendRequestResponse("pending");
    }

    /** Accepts a request someone sent the user. */
    @Transactional
    public void acceptRequest(UUID userId, UUID requestId) {
        Friendship request = findPendingRequestTo(userId, requestId);
        request.accept(clock.instant());
        publishFriendsChanged(userId, request.getRequester().getId());
    }

    /** Declines a request someone sent the user (it is deleted). */
    @Transactional
    public void declineRequest(UUID userId, UUID requestId) {
        Friendship request = findPendingRequestTo(userId, requestId);
        friendshipRepository.delete(request);
        publishFriendsChanged(userId, request.getRequester().getId());
    }

    /** Unfriends someone, or cancels the request the user sent them. */
    @Transactional
    public void removeFriend(UUID userId, UUID friendId) {
        Friendship friendship = friendshipRepository.findBetweenForUpdate(userId, friendId)
                .filter(found -> found.isAccepted() || found.getRequester().getId().equals(userId))
                .orElseThrow(() -> new NotFoundException("You are not friends with them."));
        friendshipRepository.delete(friendship);
        publishFriendsChanged(userId, friendId);
    }

    private Friendship findPendingRequestTo(UUID userId, UUID requestId) {
        return friendshipRepository.findById(requestId)
                .filter(request -> !request.isAccepted() && request.getAddressee().getId().equals(userId))
                .orElseThrow(() -> new NotFoundException("That friend request is no longer waiting for you."));
    }

    private void publishFriendsChanged(UUID first, UUID second) {
        eventPublisher.publishEvent(SocialEvent.friendsChanged(List.of(first, second)));
    }

    private static FriendshipResponse toResponse(Friendship friendship, String kind, FriendProfileResponse friend) {
        return new FriendshipResponse(friendship.getId(), kind, friend, friendship.getCreatedAt());
    }
}
