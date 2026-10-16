package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SignUpRequest(
        @NotBlank(message = "Enter a name of 1–40 characters.")
        @Size(max = 40, message = "Enter a name of 1–40 characters.")
        String displayName,
        @NotBlank(message = "Usernames are 3–20 lowercase letters, numbers or underscores.")
        String username,
        @NotBlank(message = "Choose a password.")
        String password) {
}
