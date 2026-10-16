package com.desktopfriends.backend.exception;

import org.springframework.http.HttpStatus;

/**
 * A request the API refuses, with a message written for people (the app shows it as is). Throw one of the
 * subclasses; GlobalExceptionHandler turns it into {"status": ..., "error": message}.
 */
public abstract class ApiException extends RuntimeException {

    private final HttpStatus status;

    protected ApiException(HttpStatus status, String message) {
        super(message);
        this.status = status;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
