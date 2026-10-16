package com.desktopfriends.backend.config;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.desktopfriends.backend.support.IntegrationTestSupport;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("CORS: the app's origins may call the API, other websites may not")
class CorsIntegrationTest extends IntegrationTestSupport {

    @Test
    void allowsTheDevServerAndThePackagedApp() throws Exception {
        for (String origin : new String[] {"http://localhost:5173", "file://", "null"}) {
            mockMvc.perform(options("/api/friends")
                            .header("Origin", origin)
                            .header("Access-Control-Request-Method", "GET")
                            .header("Access-Control-Request-Headers", "authorization"))
                    .andExpect(status().isOk())
                    .andExpect(header().string("Access-Control-Allow-Origin", origin));
        }
    }

    @Test
    void refusesOtherWebsites() throws Exception {
        mockMvc.perform(options("/api/friends")
                        .header("Origin", "https://evil.example")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden());
    }
}
