package com.desktopfriends.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/**
 * One row per pair of people (public.friendships): a pending request from requester to addressee, or an
 * accepted friendship. Declining, cancelling or unfriending deletes the row.
 */
@Entity
@Table(name = "friendships")
public class Friendship {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_id", nullable = false, updatable = false)
    private Profile requester;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "addressee_id", nullable = false, updatable = false)
    private Profile addressee;

    @Column(nullable = false)
    private FriendshipStatus status = FriendshipStatus.PENDING;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    protected Friendship() {
    }

    public Friendship(Profile requester, Profile addressee, Instant createdAt) {
        this.requester = requester;
        this.addressee = addressee;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public Profile getRequester() {
        return requester;
    }

    public Profile getAddressee() {
        return addressee;
    }

    public FriendshipStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getAcceptedAt() {
        return acceptedAt;
    }

    public boolean isAccepted() {
        return status == FriendshipStatus.ACCEPTED;
    }

    /** The person on the other side of this friendship, seen from the given user. */
    public Profile otherThan(UUID userId) {
        return requester.getId().equals(userId) ? addressee : requester;
    }

    public void accept(Instant at) {
        this.status = FriendshipStatus.ACCEPTED;
        this.acceptedAt = at;
    }
}
