package com.desktopfriends.backend.support;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import tools.jackson.databind.json.JsonMapper;

/**
 * Base for tests that run the whole backend: real HTTP security (ES256 tokens from the fake Supabase Auth),
 * the real Supabase schema in Postgres, and a clock tests can move forward. Every test starts with no accounts.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@Import(TestClockConfig.class)
public abstract class IntegrationTestSupport {

    protected static final String PASSWORD = "Friends#2026";
    protected static final TestDatabase DATABASE = TestDatabase.start();
    protected static final FakeSupabaseAuthServer AUTH = FakeSupabaseAuthServer.start(DATABASE);
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected MutableClock clock;

    @DynamicPropertySource
    static void connectToTestServices(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", DATABASE::jdbcUrl);
        registry.add("spring.datasource.username", DATABASE::username);
        registry.add("spring.datasource.password", DATABASE::password);
        registry.add("app.supabase.url", AUTH::baseUrl);
        registry.add("app.supabase.publishable-key", () -> FakeSupabaseAuthServer.PUBLISHABLE_KEY);
    }

    @BeforeEach
    void startFresh() {
        DATABASE.reset();
        AUTH.reset();
        clock.reset();
    }

    /** A signed-in account. */
    public record TestUser(String id, String username, String displayName, String accessToken, String refreshToken) {
    }

    /** Signs up through the API, like the app's sign-up form. */
    protected TestUser signUp(String username, String displayName) throws Exception {
        String body = mockMvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("username", username, "displayName", displayName, "password", PASSWORD))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return new TestUser(JsonPath.read(body, "$.profile.id"), username, displayName,
                JsonPath.read(body, "$.accessToken"), JsonPath.read(body, "$.refreshToken"));
    }

    protected ResultActions getAs(TestUser user, String url) throws Exception {
        return mockMvc.perform(authorized(get(url), user));
    }

    protected ResultActions postAs(TestUser user, String url) throws Exception {
        return mockMvc.perform(authorized(post(url), user));
    }

    protected ResultActions postAs(TestUser user, String url, Map<String, ?> body) throws Exception {
        return mockMvc.perform(authorized(post(url), user).contentType(MediaType.APPLICATION_JSON).content(json(body)));
    }

    protected ResultActions putAs(TestUser user, String url, Map<String, ?> body) throws Exception {
        return mockMvc.perform(authorized(put(url), user).contentType(MediaType.APPLICATION_JSON).content(json(body)));
    }

    protected ResultActions deleteAs(TestUser user, String url) throws Exception {
        return mockMvc.perform(authorized(delete(url), user));
    }

    /** Reads a value from a JSON response body. */
    protected static <T> T read(ResultActions result, String path) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), path);
    }

    protected static List<String> readList(ResultActions result, String path) throws Exception {
        return read(result, path);
    }

    protected static String json(Object value) {
        return JSON.writeValueAsString(value);
    }

    private static MockHttpServletRequestBuilder authorized(MockHttpServletRequestBuilder request, TestUser user) {
        return request.header("Authorization", "Bearer " + user.accessToken());
    }
}
