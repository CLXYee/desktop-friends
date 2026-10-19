package com.desktopfriends.backend.controller;

import com.desktopfriends.backend.dto.request.UpdateProfileRequest;
import com.desktopfriends.backend.dto.response.ProfileResponse;
import com.desktopfriends.backend.security.CurrentUserId;
import com.desktopfriends.backend.service.ProfileService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/profiles")
public class ProfileController {

    private final ProfileService profileService;

    public ProfileController(ProfileService profileService) {
        this.profileService = profileService;
    }

    /** The signed-in user's own profile. */
    @GetMapping("/me")
    public ProfileResponse getMyProfile(@CurrentUserId UUID userId) {
        return profileService.getProfile(userId);
    }

    /** Sets the character shown as your avatar in chats. */
    @PutMapping("/me")
    public ProfileResponse updateMyProfile(@CurrentUserId UUID userId, @Valid @RequestBody UpdateProfileRequest request) {
        return profileService.changeCharacter(userId, request.characterId());
    }
}
