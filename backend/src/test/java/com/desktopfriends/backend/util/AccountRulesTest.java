package com.desktopfriends.backend.util;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class AccountRulesTest {

    @Test
    void acceptsAStrongPassword() {
        assertThat(AccountRules.isStrongPassword("Admin#2026")).isTrue();
        assertThat(AccountRules.isStrongPassword("aB3$efgh")).isTrue();
    }

    @Test
    void namesEveryRuleAWeakPasswordMisses() {
        assertThat(AccountRules.unmetPasswordRules("short")).containsExactly("length", "upper", "number", "symbol");
        assertThat(AccountRules.unmetPasswordRules("alllowercase1!")).containsExactly("upper");
        assertThat(AccountRules.unmetPasswordRules("ALLUPPER1!")).containsExactly("lower");
        assertThat(AccountRules.unmetPasswordRules("NoNumbers!")).containsExactly("number");
        assertThat(AccountRules.unmetPasswordRules("NoSymbol123")).containsExactly("symbol");
        assertThat(AccountRules.unmetPasswordRules("Ab1!xyz")).containsExactly("length");
        assertThat(AccountRules.unmetPasswordRules(null)).hasSize(5);
    }

    @Test
    void doesNotCountASpaceAsASymbol() {
        assertThat(AccountRules.unmetPasswordRules("Abcdefg 1")).containsExactly("symbol");
    }

    @Test
    void usernamesAreThreeToTwentyLowercaseLettersNumbersOrUnderscores() {
        assertThat(AccountRules.isValidUsername("user1")).isTrue();
        assertThat(AccountRules.isValidUsername("  Admin ")).isTrue();
        assertThat(AccountRules.normalizeUsername("  Admin ")).isEqualTo("admin");
        assertThat(AccountRules.isValidUsername("ab")).isFalse();
        assertThat(AccountRules.isValidUsername("has space")).isFalse();
        assertThat(AccountRules.isValidUsername("a".repeat(21))).isFalse();
        assertThat(AccountRules.isValidUsername(null)).isFalse();
    }
}
