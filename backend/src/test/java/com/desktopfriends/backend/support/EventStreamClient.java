package com.desktopfriends.backend.support;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;

/** Reads a user's live event stream (/api/events) over real HTTP, like the app does, collecting the events. */
public final class EventStreamClient implements AutoCloseable {

    private static final Duration WAIT = Duration.ofSeconds(10);

    /** An event as the stream delivered it. */
    public record StreamEvent(String name, String data) {
    }

    private final List<StreamEvent> events = new CopyOnWriteArrayList<>();
    private final InputStream body;
    private final Thread reader;

    private EventStreamClient(InputStream body) {
        this.body = body;
        this.reader = Thread.ofVirtual().start(this::read);
    }

    public static EventStreamClient open(int port, String accessToken) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/events"))
                .header("Authorization", "Bearer " + accessToken)
                .header("Accept", "text/event-stream")
                .GET().build();
        HttpResponse<InputStream> response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofInputStream());
        if (response.statusCode() != 200) throw new IllegalStateException("Event stream answered " + response.statusCode());
        EventStreamClient client = new EventStreamClient(response.body());
        client.await(event -> event.name().equals("ready"), "the stream to be ready");
        return client;
    }

    public List<StreamEvent> events() {
        return events;
    }

    /** Waits until an event matching the test arrives, and returns it. */
    public StreamEvent await(Predicate<StreamEvent> match, String what) throws InterruptedException {
        long deadline = System.nanoTime() + WAIT.toNanos();
        while (System.nanoTime() < deadline) {
            for (StreamEvent event : events) {
                if (match.test(event)) return event;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("Timed out waiting for " + what + "; got " + events);
    }

    public static Predicate<StreamEvent> named(String name) {
        return event -> event.name().equals(name);
    }

    private void read() {
        try (BufferedReader lines = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8))) {
            String name = null;
            StringBuilder data = new StringBuilder();
            for (String line; (line = lines.readLine()) != null; ) {
                if (line.startsWith("event:")) name = line.substring(6).trim();
                else if (line.startsWith("data:")) data.append(line.substring(5).trim());
                else if (line.isEmpty() && name != null) {
                    events.add(new StreamEvent(name, data.toString()));
                    name = null;
                    data.setLength(0);
                }
            }
        } catch (Exception closed) {
            // The test closed the stream.
        }
    }

    @Override
    public void close() throws Exception {
        body.close();
        reader.interrupt();
    }
}
