package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank(message = "Enter your username and password.") String username,
        @NotBlank(message = "Enter your username and password.") String password) {
}
