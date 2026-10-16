package com.desktopfriends.backend.service;

import com.desktopfriends.backend.dto.response.FriendProfileResponse;
import com.desktopfriends.backend.dto.response.PresenceChangeResponse;
import com.desktopfriends.backend.entity.PresenceStatus;
import com.desktopfriends.backend.entity.Profile;
import com.desktopfriends.backend.event.SocialEvent;
import com.desktopfriends.backend.exception.NotFoundException;
import com.desktopfriends.backend.repository.FriendshipRepository;
import com.desktopfriends.backend.repository.GroupMemberRepository;
import com.desktopfriends.backend.repository.ProfileRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Online status. The app reports online/idle/offline and re-reports it every minute (the heartbeat); a
 * status that hasn't been re-reported for STALE_AFTER counts as offline (e.g. the app crashed).
 */
@Service
public class PresenceService {

    public static final Duration STALE_AFTER = Duration.ofMinutes(3);

    private final ProfileRepository profileRepository;
    private final FriendshipRepository friendshipRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final ApplicationEventPublisher eventPublisher;
    private final Clock clock;

    public PresenceService(ProfileRepository profileRepository, FriendshipRepository friendshipRepository,
            GroupMemberRepository groupMemberRepository, ApplicationEventPublisher eventPublisher, Clock clock) {
        this.profileRepository = profileRepository;
        this.friendshipRepository = friendshipRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.eventPublisher = eventPublisher;
        this.clock = clock;
    }

    /** The status people see: what was reported, unless the app stopped reporting it. */
    public PresenceStatus effectivePresence(Profile profile) {
        Instant lastSeen = profile.getLastSeenAt();
        boolean isFresh = lastSeen != null && lastSeen.isAfter(clock.instant().minus(STALE_AFTER));
        return profile.getStatus() != PresenceStatus.OFFLINE && isFresh ? profile.getStatus() : PresenceStatus.OFFLINE;
    }

    /** How someone appears to a person allowed to see them. */
    public FriendProfileResponse toFriendProfile(Profile profile) {
        return new FriendProfileResponse(profile.getId(), profile.getUsername(), profile.getDisplayName(),
                effectivePresence(profile), profile.getLastSeenAt());
    }

    /**
     * Records the user's status (and heartbeat). Friends and fellow group members are told live when what
     * they see changes, not on every heartbeat.
     */
    @Transactional
    public void updateStatus(UUID userId, PresenceStatus status) {
        Profile profile = profileRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("Your profile is missing. Log out and in again."));
        PresenceStatus before = effectivePresence(profile);
        profile.reportStatus(status, clock.instant());
        PresenceStatus after = effectivePresence(profile);
        if (before != after) {
            eventPublisher.publishEvent(new SocialEvent(findAudienceIds(userId), SocialEvent.PRESENCE,
                    new PresenceChangeResponse(userId, after, profile.getLastSeenAt())));
        }
    }

    /** Everyone who may see the user's status: their friends and fellow group members. */
    @Transactional(readOnly = true)
    public Set<UUID> findAudienceIds(UUID userId) {
        Set<UUID> audience = new HashSet<>(friendshipRepository.findFriendIds(userId));
        audience.addAll(groupMemberRepository.findCoMemberIds(userId));
        return audience;
    }
}
