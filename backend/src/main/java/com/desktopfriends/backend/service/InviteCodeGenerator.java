package com.desktopfriends.backend.service;

import java.security.SecureRandom;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

/** Invite codes: 12 random hex characters (48 bits), shared as desktop-friends://join/<code>. */
@Component
public class InviteCodeGenerator {

    private static final int CODE_BYTES = 6;
    private final SecureRandom random = new SecureRandom();

    public String generate() {
        byte[] bytes = new byte[CODE_BYTES];
        random.nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }

    /** The code in a pasted link or bare code ("desktop-friends://join/ab12…/" → "ab12…"), lowercased. */
    public static String normalize(String linkOrCode) {
        String text = linkOrCode == null ? "" : linkOrCode.trim().toLowerCase().replaceAll("/+$", "");
        int slash = text.lastIndexOf('/');
        return slash >= 0 ? text.substring(slash + 1) : text;
    }
}
