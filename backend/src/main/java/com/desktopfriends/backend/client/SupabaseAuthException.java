package com.desktopfriends.backend.client;

/**
 * Supabase Auth refused a request, or couldn't be reached (status 0). errorCode is Supabase's machine-readable
 * code, e.g. "invalid_credentials" or "user_already_exists".
 */
public class SupabaseAuthException extends RuntimeException {

    private final int status;
    private final String errorCode;

    public SupabaseAuthException(int status, String errorCode, String message) {
        super(message);
        this.status = status;
        this.errorCode = errorCode;
    }

    public int getStatus() {
        return status;
    }

    public String getErrorCode() {
        return errorCode;
    }

    public boolean isUnreachable() {
        return status == 0;
    }
}
