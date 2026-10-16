package com.desktopfriends.backend.service;

import com.desktopfriends.backend.dto.response.ProfileResponse;
import com.desktopfriends.backend.entity.Profile;
import com.desktopfriends.backend.exception.NotFoundException;
import com.desktopfriends.backend.repository.ProfileRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The signed-in user's own profile. */
@Service
public class ProfileService {

    private final ProfileRepository profileRepository;

    public ProfileService(ProfileRepository profileRepository) {
        this.profileRepository = profileRepository;
    }

    @Transactional(readOnly = true)
    public ProfileResponse getProfile(UUID userId) {
        Profile profile = profileRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("Your profile is missing. Log out and in again."));
        return new ProfileResponse(profile.getId(), profile.getUsername(), profile.getDisplayName(),
                "admin".equals(profile.getRole()) ? "admin" : "user");
    }
}
