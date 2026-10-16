package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotBlank;

/** The code from an invite link (desktop-friends://join/<code>). */
public record JoinGroupRequest(@NotBlank(message = "Paste an invite link or code.") String code) {
}
