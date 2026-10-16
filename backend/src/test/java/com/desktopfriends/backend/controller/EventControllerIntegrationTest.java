package com.desktopfriends.backend.controller;

import static org.assertj.core.api.Assertions.assertThat;

import com.desktopfriends.backend.service.EventStreamService;
import com.desktopfriends.backend.support.IntegrationTestSupport;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Predicate;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;

/**
 * The live event stream over real HTTP (as the app and nginx see it): who is told about what, and when.
 */
@DisplayName("Live events: each change reaches exactly the people it concerns")
@ExtendWith(OutputCaptureExtension.class)
class EventControllerIntegrationTest extends IntegrationTestSupport {

    private static final Duration WAIT = Duration.ofSeconds(10);

    @LocalServerPort
    private int port;

    @Autowired
    private ApplicationContext applicationContext;

    private final HttpClient http = HttpClient.newHttpClient();
    private final List<Thread> readers = new CopyOnWriteArrayList<>();

    /** An event as the stream delivered it. */
    record StreamEvent(String name, String data) {
    }

    /** Opens the user's event stream and collects what arrives, in the background. */
    private List<StreamEvent> openStream(TestUser user) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/events"))
                .header("Authorization", "Bearer " + user.accessToken())
                .header("Accept", "text/event-stream")
                .GET().build();
        HttpResponse<java.io.InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Content-Type").orElse("")).startsWith("text/event-stream");
        List<StreamEvent> events = new CopyOnWriteArrayList<>();
        Thread reader = Thread.ofVirtual().start(() -> {
            try (BufferedReader lines = new BufferedReader(new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
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
                // The test ended and the stream was closed.
            }
        });
        readers.add(reader);
        waitFor(events, event -> event.name().equals("ready"), "the stream to say it is ready");
        return events;
    }

    private static void waitFor(List<StreamEvent> events, Predicate<StreamEvent> match, String what) throws InterruptedException {
        long deadline = System.nanoTime() + WAIT.toNanos();
        while (System.nanoTime() < deadline) {
            if (events.stream().anyMatch(match)) return;
            Thread.sleep(50);
        }
        throw new AssertionError("Timed out waiting for " + what + "; got " + events);
    }

    /** Gives anything that shouldn't arrive a fair chance to, before checking it didn't. */
    private static void settle() throws InterruptedException {
        Thread.sleep(500);
    }

    private static Predicate<StreamEvent> named(String name) {
        return event -> event.name().equals(name);
    }

    @AfterEach
    void closeStreams() {
        readers.forEach(Thread::interrupt);
    }

    @Test
    void streamsNeedAToken() throws Exception {
        HttpResponse<String> response = http.send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/events")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(401);
    }

    @Test
    void friendRequestsStatusChangesAndGroupInvitesReachOnlyThePeopleInvolved() throws Exception {
        TestUser amy = signUp("friend_amy", "Amy");
        TestUser ben = signUp("friend_ben", "Ben");
        TestUser cleo = signUp("friend_cleo", "Cleo");
        List<StreamEvent> amyEvents = openStream(amy);
        List<StreamEvent> benEvents = openStream(ben);
        List<StreamEvent> cleoEvents = openStream(cleo);

        // A friend request: Ben (and Amy's other windows) reload their friends; Cleo hears nothing.
        postAs(amy, "/api/friends/requests", Map.of("username", "friend_ben"));
        waitFor(benEvents, named("friends"), "Ben to hear about the request");
        waitFor(amyEvents, named("friends"), "Amy's own stream to update");
        String requestId = read(getAs(ben, "/api/friends"), "$.incoming[0].id");
        postAs(ben, "/api/friends/requests/" + requestId + "/accept");

        // Ben comes online: his friend Amy is told, with the new status; Cleo isn't.
        amyEvents.clear();
        putAs(ben, "/api/presence", Map.of("status", "online"));
        waitFor(amyEvents, event -> event.name().equals("presence") && event.data().contains(ben.id()) && event.data().contains("\"online\""),
                "Amy to see Ben come online");

        // A heartbeat that changes nothing isn't announced.
        amyEvents.clear();
        putAs(ben, "/api/presence", Map.of("status", "online"));
        settle();
        assertThat(amyEvents).noneMatch(named("presence"));

        // Amy invites Ben to a group: Ben is told.
        String groupId = read(postAs(amy, "/api/groups", Map.of("name", "Study Buddies")), "$.id");
        benEvents.clear();
        postAs(amy, "/api/groups/" + groupId + "/invitations", Map.of("friendId", ben.id()));
        waitFor(benEvents, named("groups"), "Ben to hear about the invitation");

        settle();
        assertThat(cleoEvents).extracting(StreamEvent::name).containsExactly("ready");
    }

    @Test
    void anAppClosingItsStreamIsNotAnError(CapturedOutput output) throws Exception {
        TestUser amy = signUp("friend_amy", "Amy");
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/events"))
                .header("Authorization", "Bearer " + amy.accessToken())
                .GET().build();
        HttpResponse<java.io.InputStream> response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        response.body().read();
        response.body().close();
        // The server only notices when it writes: the first keep-alive after the close still lands in the
        // socket buffer, a later one fails.
        EventStreamService streams = applicationContext.getBean(EventStreamService.class);
        for (int write = 0; write < 6; write++) {
            Thread.sleep(250);
            streams.sendKeepAlive();
        }
        Thread.sleep(500);
        assertThat(output.getAll()).doesNotContain("Unexpected error").doesNotContain("Failure in @ExceptionHandler");
    }

    @Test
    void someoneLeavingAGroupIsAnnouncedToTheRestOfIt() throws Exception {
        TestUser amy = signUp("friend_amy", "Amy");
        TestUser ben = signUp("friend_ben", "Ben");
        String groupId = read(postAs(amy, "/api/groups", Map.of("name", "Study Buddies")), "$.id");
        postAs(ben, "/api/groups/join", Map.of("code", read(getAs(amy, "/api/groups"), "$[0].inviteCode")));
        List<StreamEvent> amyEvents = openStream(amy);

        postAs(ben, "/api/groups/" + groupId + "/leave");
        waitFor(amyEvents, named("groups"), "Amy to hear that Ben left");
    }
}
