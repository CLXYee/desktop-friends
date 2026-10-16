package com.desktopfriends.backend.controller;

import com.desktopfriends.backend.security.CurrentUserId;
import com.desktopfriends.backend.service.EventStreamService;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * The live event stream (Server-Sent Events): "ready" once connected, then "friends", "groups" (reload them)
 * and "presence" ({userId, presence, lastSeenAt}) as things change.
 */
@RestController
@RequestMapping("/api/events")
public class EventController {

    private final EventStreamService eventStreamService;

    public EventController(EventStreamService eventStreamService) {
        this.eventStreamService = eventStreamService;
    }

    @GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamEvents(@CurrentUserId UUID userId) {
        return eventStreamService.subscribe(userId);
    }
}
