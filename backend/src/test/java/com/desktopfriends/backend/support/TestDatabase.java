package com.desktopfriends.backend.support;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.stream.Stream;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * One Postgres for the whole test run, set up like the Supabase project: a stand-in for Supabase's auth
 * schema, then the app's real migrations from supabase/migrations.
 */
public final class TestDatabase {

    private static final Path MIGRATIONS = Path.of("..", "supabase", "migrations");
    private static TestDatabase instance;

    private final PostgreSQLContainer container;

    private TestDatabase(PostgreSQLContainer container) {
        this.container = container;
    }

    public static synchronized TestDatabase start() {
        if (instance == null) {
            PostgreSQLContainer container = new PostgreSQLContainer("postgres:17-alpine");
            container.start();
            instance = new TestDatabase(container);
            instance.applySchema();
        }
        return instance;
    }

    public String jdbcUrl() {
        return container.getJdbcUrl();
    }

    public String username() {
        return container.getUsername();
    }

    public String password() {
        return container.getPassword();
    }

    public Connection connect() throws SQLException {
        return DriverManager.getConnection(jdbcUrl(), username(), password());
    }

    /** Removes every account and everything that belongs to them. */
    public void reset() {
        execute("truncate auth.users cascade");
    }

    public void execute(String sql) {
        try (Connection connection = connect(); Statement statement = connection.createStatement()) {
            statement.execute(sql);
        } catch (SQLException exception) {
            throw new IllegalStateException("SQL failed: " + sql, exception);
        }
    }

    private void applySchema() {
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            execute(read(Path.of("src", "test", "resources", "db", "supabase-auth-stub.sql")));
            List<Path> migrations = files.filter(file -> file.toString().endsWith(".sql")).sorted().toList();
            if (migrations.isEmpty()) throw new IllegalStateException("No migrations found in " + MIGRATIONS.toAbsolutePath());
            migrations.forEach(migration -> execute(read(migration)));
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }

    private static String read(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new UncheckedIOException(exception);
        }
    }
}
