package com.desktopfriends.backend.dto.response;

import java.util.UUID;

public record JoinGroupResponse(UUID groupId, String groupName) {
}
