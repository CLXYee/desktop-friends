package com.desktopfriends.backend.service;

import java.io.IOException;
import java.time.Duration;
import java.util.Collection;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Live event streams (Server-Sent Events), one or more per signed-in user (one per open app). Streams close
 * after STREAM_TIMEOUT and the app reconnects, which also re-checks its access token.
 *
 * Streams are kept in this process's memory, so run a single backend instance (or add a shared message
 * bus such as Redis pub/sub before scaling out).
 */
@Service
public class EventStreamService {

    public static final Duration STREAM_TIMEOUT = Duration.ofMinutes(30);
    private static final Logger log = LoggerFactory.getLogger(EventStreamService.class);

    private final Map<UUID, Set<SseEmitter>> streams = new ConcurrentHashMap<>();

    /** Opens a stream for the user; the first event, "ready", tells the app it is live. */
    public SseEmitter subscribe(UUID userId) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT.toMillis());
        streams.computeIfAbsent(userId, key -> ConcurrentHashMap.newKeySet()).add(emitter);
        emitter.onCompletion(() -> remove(userId, emitter));
        emitter.onTimeout(() -> remove(userId, emitter));
        emitter.onError(error -> remove(userId, emitter));
        trySend(userId, emitter, () -> SseEmitter.event().name("ready").data(Map.of("userId", userId), MediaType.APPLICATION_JSON));
        return emitter;
    }

    /** Sends an event to every open stream of these users. */
    public void send(Collection<UUID> userIds, String name, Object data) {
        Object payload = data == null ? Map.of() : data;
        for (UUID userId : userIds) {
            for (SseEmitter emitter : streams.getOrDefault(userId, Set.of())) {
                trySend(userId, emitter, () -> SseEmitter.event().name(name).data(payload, MediaType.APPLICATION_JSON));
            }
        }
    }

    /** A comment every 25 seconds keeps idle streams open through proxies (nginx) and notices closed ones. */
    @Scheduled(fixedDelay = 25_000)
    public void sendKeepAlive() {
        streams.forEach((userId, emitters) -> emitters.forEach(
                emitter -> trySend(userId, emitter, () -> SseEmitter.event().comment("keep-alive"))));
    }

    public int openStreamCount(UUID userId) {
        return streams.getOrDefault(userId, Set.of()).size();
    }

    /**
     * Closes every stream when the backend shuts down. Streams never finish on their own, so graceful
     * shutdown would otherwise wait out its whole timeout; the apps reconnect to the next instance.
     */
    @EventListener(ContextClosedEvent.class)
    public void closeAllStreams() {
        streams.values().forEach(emitters -> emitters.forEach(SseEmitter::complete));
        streams.clear();
    }

    // A builder can only be built once, so each stream gets a fresh one.
    private void trySend(UUID userId, SseEmitter emitter, Supplier<SseEmitter.SseEventBuilder> event) {
        try {
            emitter.send(event.get());
        } catch (IOException | IllegalStateException exception) {
            log.debug("Dropping a closed event stream of {}", userId);
            remove(userId, emitter);
        }
    }

    private void remove(UUID userId, SseEmitter emitter) {
        streams.computeIfPresent(userId, (key, emitters) -> {
            emitters.remove(emitter);
            return emitters.isEmpty() ? null : emitters;
        });
    }
}
