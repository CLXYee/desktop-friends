package com.desktopfriends.backend.exception;

import org.springframework.http.HttpStatus;

/** The user is signed in but not allowed to do this (e.g. a member resetting the owner's invite link). */
public class ForbiddenException extends ApiException {

    public ForbiddenException(String message) {
        super(HttpStatus.FORBIDDEN, message);
    }
}
