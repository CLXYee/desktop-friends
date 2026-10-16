package com.desktopfriends.backend.dto.request;

import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record InviteToGroupRequest(@NotNull(message = "Choose a friend to invite.") UUID friendId) {
}
