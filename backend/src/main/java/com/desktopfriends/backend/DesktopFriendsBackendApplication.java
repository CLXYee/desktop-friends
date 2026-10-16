package com.desktopfriends.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * REST API for Desktop Friends. Accounts live in Supabase Auth and data in Supabase Postgres; this
 * service holds the rules (who may befriend, invite or see whom) and pushes live updates to the app.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@EnableScheduling
public class DesktopFriendsBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(DesktopFriendsBackendApplication.class, args);
    }
}
