package com.desktopfriends.backend.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Origins allowed to call the API from a browser context: the Vite dev server, and the packaged Electron
 * app (pages loaded from file:// send "file://" or "null"). The API uses bearer tokens, not cookies.
 */
@ConfigurationProperties(prefix = "app.cors")
public record CorsProperties(List<String> allowedOrigins) {

    public CorsProperties {
        allowedOrigins = allowedOrigins == null ? List.of() : List.copyOf(allowedOrigins);
    }
}
