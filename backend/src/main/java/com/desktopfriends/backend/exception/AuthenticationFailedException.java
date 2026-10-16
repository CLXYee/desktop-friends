package com.desktopfriends.backend.exception;

import org.springframework.http.HttpStatus;

/** Logging in or refreshing a session failed, or Supabase Auth refused the request. */
public class AuthenticationFailedException extends ApiException {

    public AuthenticationFailedException(HttpStatus status, String message) {
        super(status, message);
    }
}
