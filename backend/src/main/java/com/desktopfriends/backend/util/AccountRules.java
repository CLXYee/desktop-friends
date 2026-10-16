package com.desktopfriends.backend.util;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Username, display name and password rules (the sign-up form in the app checks the same ones). */
public final class AccountRules {

    public static final Pattern USERNAME_PATTERN = Pattern.compile("^[a-z0-9_]{3,20}$");
    public static final int DISPLAY_NAME_MAX = 40;
    public static final int PASSWORD_MIN_LENGTH = 8;

    private AccountRules() {
    }

    public static String normalizeUsername(String username) {
        return username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
    }

    public static boolean isValidUsername(String username) {
        return USERNAME_PATTERN.matcher(normalizeUsername(username)).matches();
    }

    /** The rules a password doesn't meet yet: length, upper, lower, number, symbol (empty when it is fine). */
    public static List<String> unmetPasswordRules(String password) {
        String value = password == null ? "" : password;
        List<String> unmet = new ArrayList<>();
        if (value.codePointCount(0, value.length()) < PASSWORD_MIN_LENGTH) unmet.add("length");
        if (!value.matches("(?s).*[A-Z].*")) unmet.add("upper");
        if (!value.matches("(?s).*[a-z].*")) unmet.add("lower");
        if (!value.matches("(?s).*[0-9].*")) unmet.add("number");
        if (!value.matches("(?s).*[^A-Za-z0-9\\s].*")) unmet.add("symbol");
        return unmet;
    }

    public static boolean isStrongPassword(String password) {
        return unmetPasswordRules(password).isEmpty();
    }
}
