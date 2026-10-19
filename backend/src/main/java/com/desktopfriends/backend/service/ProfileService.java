package com.desktopfriends.backend.service;

import com.desktopfriends.backend.dto.response.ProfileResponse;
import com.desktopfriends.backend.entity.Profile;
import com.desktopfriends.backend.exception.BadRequestException;
import com.desktopfriends.backend.exception.NotFoundException;
import com.desktopfriends.backend.repository.ProfileRepository;
import com.desktopfriends.backend.util.CharacterCatalog;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The signed-in user's own profile and character. */
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
        return toResponse(profile);
    }

    /** Sets the companion character shown as the user's avatar (the app reports the one picked). */
    @Transactional
    public ProfileResponse changeCharacter(UUID userId, String characterId) {
        if (!CharacterCatalog.isKnown(characterId)) {
            throw new BadRequestException("Unknown character. Pick one of " + String.join(", ", CharacterCatalog.CHARACTER_IDS) + ".");
        }
        Profile profile = profileRepository.findById(userId)
                .orElseThrow(() -> new NotFoundException("Your profile is missing. Log out and in again."));
        profile.changeCharacter(characterId);
        return toResponse(profile);
    }

    private static ProfileResponse toResponse(Profile profile) {
        return new ProfileResponse(profile.getId(), profile.getUsername(), profile.getDisplayName(),
                "admin".equals(profile.getRole()) ? "admin" : "user", profile.getCharacterId());
    }
}
