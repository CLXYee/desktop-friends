package com.desktopfriends.backend.dto.request;

import com.desktopfriends.backend.entity.PresenceStatus;
import jakarta.validation.constraints.NotNull;

/** "online", "idle" or "offline"; anything else arrives as null. */
public record UpdatePresenceRequest(@NotNull(message = "Unknown status. Use online, idle or offline.") PresenceStatus status) {
}
