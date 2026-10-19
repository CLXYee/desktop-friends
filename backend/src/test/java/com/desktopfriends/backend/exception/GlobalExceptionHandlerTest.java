package com.desktopfriends.backend.exception;

import static org.assertj.core.api.Assertions.assertThat;

import com.desktopfriends.backend.dto.response.ErrorResponse;
import com.desktopfriends.backend.entity.ConversationMember;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

class GlobalExceptionHandlerTest {

    /** A row changed or vanished between reading and writing it (e.g. leaving a chat while it's marked read). */
    @Test
    void aRaceIsAConflictNotAServerError() {
        ResponseEntity<ErrorResponse> response = new GlobalExceptionHandler()
                .handleConflict(new ObjectOptimisticLockingFailureException(ConversationMember.class, "id"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isEqualTo(new ErrorResponse(409, "That just changed. Refresh and try again."));
    }
}
