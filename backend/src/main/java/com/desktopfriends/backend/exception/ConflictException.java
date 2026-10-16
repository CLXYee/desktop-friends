package com.desktopfriends.backend.exception;

import org.springframework.http.HttpStatus;

/** The request clashes with what already exists (already friends, already invited, username taken). */
public class ConflictException extends ApiException {

    public ConflictException(String message) {
        super(HttpStatus.CONFLICT, message);
    }
}
