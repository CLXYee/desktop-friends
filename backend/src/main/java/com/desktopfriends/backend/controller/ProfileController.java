package com.desktopfriends.backend.controller;

import com.desktopfriends.backend.dto.response.ProfileResponse;
import com.desktopfriends.backend.security.CurrentUserId;
import com.desktopfriends.backend.service.ProfileService;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
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
}
