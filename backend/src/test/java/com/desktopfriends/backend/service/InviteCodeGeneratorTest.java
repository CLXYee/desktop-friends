package com.desktopfriends.backend.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

class InviteCodeGeneratorTest {

    @Test
    void generatesTwelveRandomHexCharacters() {
        InviteCodeGenerator generator = new InviteCodeGenerator();
        Set<String> codes = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            String code = generator.generate();
            assertThat(code).matches("^[0-9a-f]{12}$");
            codes.add(code);
        }
        assertThat(codes).hasSize(1000);
    }

    @Test
    void readsTheCodeFromAPastedLinkOrBareCode() {
        assertThat(InviteCodeGenerator.normalize("desktop-friends://join/0a1b2c3d4e5f")).isEqualTo("0a1b2c3d4e5f");
        assertThat(InviteCodeGenerator.normalize("  DESKTOP-FRIENDS://JOIN/0A1B2C3D4E5F/ ")).isEqualTo("0a1b2c3d4e5f");
        assertThat(InviteCodeGenerator.normalize(" 0A1B2C3D4E5F ")).isEqualTo("0a1b2c3d4e5f");
        assertThat(InviteCodeGenerator.normalize(null)).isEmpty();
    }
}
