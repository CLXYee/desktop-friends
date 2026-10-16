package com.desktopfriends.backend.controller;

import com.desktopfriends.backend.dto.request.UpdatePresenceRequest;
import com.desktopfriends.backend.security.CurrentUserId;
import com.desktopfriends.backend.service.PresenceService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The app reports the user's status here: on changes and every minute as a heartbeat. */
@RestController
@RequestMapping("/api/presence")
public class PresenceController {

    private final PresenceService presenceService;

    public PresenceController(PresenceService presenceService) {
        this.presenceService = presenceService;
    }

    @PutMapping
    public ResponseEntity<Void> updatePresence(@CurrentUserId UUID userId, @Valid @RequestBody UpdatePresenceRequest request) {
        presenceService.updateStatus(userId, request.status());
        return ResponseEntity.noContent().build();
    }
}
