package com.desktopfriends.backend.support;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.KeyUse;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import tools.jackson.databind.json.JsonMapper;

/**
 * A stand-in for Supabase Auth (GoTrue) on localhost: sign-up (which creates the auth.users row, so the real
 * profile trigger runs), password and refresh-token logins, logout, and the JWKS the backend verifies
 * tokens with. Tokens are real ES256 JWTs shaped like Supabase's.
 */
public final class FakeSupabaseAuthServer {

    public static final String PUBLISHABLE_KEY = "sb_publishable_test";
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static FakeSupabaseAuthServer instance;

    private final TestDatabase database;
    private final HttpServer server;
    private final ECKey signingKey;
    private final Map<String, Account> accountsByEmail = new ConcurrentHashMap<>();
    private final Map<String, String> userIdByRefreshToken = new ConcurrentHashMap<>();
    private volatile int signOutCalls;

    private record Account(String userId, String email, String password) {
    }

    private FakeSupabaseAuthServer(TestDatabase database) throws IOException, JOSEException {
        this.database = database;
        this.signingKey = new ECKeyGenerator(Curve.P_256).keyID("test-signing-key").algorithm(JWSAlgorithm.ES256)
                .keyUse(KeyUse.SIGNATURE).generate();
        this.server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/auth/v1/", this::handle);
        server.start();
    }

    public static synchronized FakeSupabaseAuthServer start(TestDatabase database) {
        if (instance == null) {
            try {
                instance = new FakeSupabaseAuthServer(database);
            } catch (IOException | JOSEException exception) {
                throw new IllegalStateException(exception);
            }
        }
        return instance;
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public String issuer() {
        return baseUrl() + "/auth/v1";
    }

    public void reset() {
        accountsByEmail.clear();
        userIdByRefreshToken.clear();
        signOutCalls = 0;
    }

    public int signOutCalls() {
        return signOutCalls;
    }

    /** A token for the user, shaped like Supabase's, with the given tweaks (e.g. wrong issuer, expired). */
    public String mintToken(String userId, Consumer<JWTClaimsSet.Builder> tweaks) {
        return sign(signingKey, userId, tweaks);
    }

    /** A token signed with a key the backend doesn't know. */
    public String mintTokenWithUnknownKey(String userId) {
        try {
            ECKey stranger = new ECKeyGenerator(Curve.P_256).keyID("test-signing-key").generate();
            return sign(stranger, userId, claims -> { });
        } catch (JOSEException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private String sign(ECKey key, String userId, Consumer<JWTClaimsSet.Builder> tweaks) {
        Instant now = Instant.now();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer(issuer())
                .subject(userId)
                .audience("authenticated")
                .claim("role", "authenticated")
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(Duration.ofHours(1))));
        tweaks.accept(claims);
        try {
            SignedJWT jwt = new SignedJWT(
                    new JWSHeader.Builder(JWSAlgorithm.ES256).keyID(key.getKeyID()).type(JOSEObjectType.JWT).build(), claims.build());
            jwt.sign(new ECDSASigner(key));
            return jwt.serialize();
        } catch (JOSEException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private void handle(HttpExchange exchange) throws IOException {
        try (exchange) {
            String path = exchange.getRequestURI().getPath();
            String query = exchange.getRequestURI().getQuery();
            if (path.equals("/auth/v1/.well-known/jwks.json")) {
                respond(exchange, 200, new JWKSet(signingKey.toPublicJWK()).toString());
                return;
            }
            if (!PUBLISHABLE_KEY.equals(exchange.getRequestHeaders().getFirst("apikey"))) {
                respond(exchange, 401, error("no_api_key", "No API key found in request"));
                return;
            }
            Map<?, ?> body = readBody(exchange);
            switch (path) {
                case "/auth/v1/signup" -> signUp(exchange, body);
                case "/auth/v1/token" -> {
                    if ("grant_type=password".equals(query)) passwordLogin(exchange, body);
                    else if ("grant_type=refresh_token".equals(query)) refresh(exchange, body);
                    else respond(exchange, 400, error("validation_failed", "Unsupported grant type"));
                }
                case "/auth/v1/logout" -> {
                    signOutCalls++;
                    exchange.sendResponseHeaders(204, -1);
                }
                default -> respond(exchange, 404, error("not_found", "Not found"));
            }
        } catch (RuntimeException | SQLException exception) {
            respond(exchange, 500, error("unexpected_failure", exception.getMessage()));
        }
    }

    private void signUp(HttpExchange exchange, Map<?, ?> body) throws IOException, SQLException {
        String email = String.valueOf(body.get("email"));
        if (accountsByEmail.containsKey(email)) {
            respond(exchange, 422, error("user_already_exists", "User already registered"));
            return;
        }
        String userId;
        try (Connection connection = database.connect();
                PreparedStatement insert = connection.prepareStatement(
                        "insert into auth.users (email, raw_user_meta_data) values (?, ?::jsonb) returning id")) {
            insert.setString(1, email);
            insert.setString(2, JSON.writeValueAsString(body.get("data")));
            try (ResultSet result = insert.executeQuery()) {
                result.next();
                userId = result.getString(1);
            }
        } catch (SQLException rejected) {
            // e.g. the profile trigger refused the username, as Supabase reports it.
            respond(exchange, 500, error("unexpected_failure", "Database error saving new user"));
            return;
        }
        accountsByEmail.put(email, new Account(userId, email, String.valueOf(body.get("password"))));
        respond(exchange, 200, session(userId, email));
    }

    private void passwordLogin(HttpExchange exchange, Map<?, ?> body) throws IOException {
        Account account = accountsByEmail.get(String.valueOf(body.get("email")));
        if (account == null || !account.password().equals(body.get("password"))) {
            respond(exchange, 400, error("invalid_credentials", "Invalid login credentials"));
            return;
        }
        respond(exchange, 200, session(account.userId(), account.email()));
    }

    private void refresh(HttpExchange exchange, Map<?, ?> body) throws IOException {
        String userId = userIdByRefreshToken.remove(String.valueOf(body.get("refresh_token")));
        if (userId == null) {
            respond(exchange, 400, error("refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found"));
            return;
        }
        String email = accountsByEmail.values().stream().filter(account -> account.userId().equals(userId))
                .map(Account::email).findFirst().orElse("");
        respond(exchange, 200, session(userId, email));
    }

    private String session(String userId, String email) {
        String refreshToken = UUID.randomUUID().toString();
        userIdByRefreshToken.put(refreshToken, userId);
        Instant expiresAt = Instant.now().plus(Duration.ofHours(1));
        return JSON.writeValueAsString(Map.of(
                "access_token", mintToken(userId, claims -> { }),
                "token_type", "bearer",
                "expires_in", 3600,
                "expires_at", expiresAt.getEpochSecond(),
                "refresh_token", refreshToken,
                "user", Map.of("id", userId, "email", email)));
    }

    private static String error(String code, String message) {
        return JSON.writeValueAsString(Map.of("code", 400, "error_code", code, "msg", message));
    }

    private static Map<?, ?> readBody(HttpExchange exchange) throws IOException {
        byte[] bytes = exchange.getRequestBody().readAllBytes();
        return bytes.length == 0 ? Map.of() : JSON.readValue(bytes, Map.class);
    }

    private static void respond(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }
}
