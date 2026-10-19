package com.desktopfriends.backend.exception;

import org.springframework.http.HttpStatus;

/** Slow down: e.g. too many messages in a few seconds. */
public class TooManyRequestsException extends ApiException {

    public TooManyRequestsException(String message) {
        super(HttpStatus.TOO_MANY_REQUESTS, message);
    }
}
