package com.desktopfriends.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.DynamicUpdate;

/**
 * One row per account (public.profiles). Supabase creates it when someone signs up; the backend only
 * changes the online status.
 */
@Entity
@Table(name = "profiles")
@DynamicUpdate
public class Profile {

    @Id
    private UUID id;

    @Column(nullable = false, updatable = false)
    private String username;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(nullable = false, updatable = false)
    private String role;

    @Column(nullable = false)
    private PresenceStatus status = PresenceStatus.OFFLINE;

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    protected Profile() {
    }

    public UUID getId() {
        return id;
    }

    public String getUsername() {
        return username;
    }

    public String getDisplayName() {
        return displayName;
    }

    public String getRole() {
        return role;
    }

    public PresenceStatus getStatus() {
        return status;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    /** Records a status report from the app (also the heartbeat). */
    public void reportStatus(PresenceStatus status, Instant at) {
        this.status = status;
        this.lastSeenAt = at;
    }
}
