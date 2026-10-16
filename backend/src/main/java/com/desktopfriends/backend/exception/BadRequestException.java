package com.desktopfriends.backend.exception;

import org.springframework.http.HttpStatus;

/** The request can't be carried out as asked (e.g. a blank group name, adding yourself). */
public class BadRequestException extends ApiException {

    public BadRequestException(String message) {
        super(HttpStatus.BAD_REQUEST, message);
    }
}
