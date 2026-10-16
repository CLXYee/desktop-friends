package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotBlank;

public record RefreshTokenRequest(@NotBlank(message = "Your session ended. Log in again.") String refreshToken) {
}
