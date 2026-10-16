package com.desktopfriends.backend.exception;

import org.springframework.http.HttpStatus;

/** The thing asked for doesn't exist, or isn't yours to act on (both look the same, on purpose). */
public class NotFoundException extends ApiException {

    public NotFoundException(String message) {
        super(HttpStatus.NOT_FOUND, message);
    }
}
