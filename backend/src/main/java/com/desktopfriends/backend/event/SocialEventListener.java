package com.desktopfriends.backend.event;

import com.desktopfriends.backend.service.EventStreamService;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** Pushes social events to the affected users, only after the change is safely committed. */
@Component
public class SocialEventListener {

    private final EventStreamService eventStreamService;

    public SocialEventListener(EventStreamService eventStreamService) {
        this.eventStreamService = eventStreamService;
    }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onSocialEvent(SocialEvent event) {
        eventStreamService.send(event.recipientIds(), event.name(), event.data());
    }
}
