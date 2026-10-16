package com.desktopfriends.backend.controller;

import com.desktopfriends.backend.dto.request.LoginRequest;
import com.desktopfriends.backend.dto.request.RefreshTokenRequest;
import com.desktopfriends.backend.dto.request.SignUpRequest;
import com.desktopfriends.backend.dto.response.AuthResponse;
import com.desktopfriends.backend.security.CurrentUserId;
import com.desktopfriends.backend.service.AuthService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Sign up, log in, keep the session fresh, and log out. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signUp(@Valid @RequestBody SignUpRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.signUp(request));
    }

    @PostMapping("/login")
    public AuthResponse logIn(@Valid @RequestBody LoginRequest request) {
        return authService.logIn(request);
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return authService.refresh(request.refreshToken());
    }

    /** Marks the user offline and ends this session. */
    @PostMapping("/logout")
    public ResponseEntity<Void> logOut(@CurrentUserId UUID userId, @AuthenticationPrincipal Jwt accessToken) {
        authService.logOut(userId, accessToken.getTokenValue());
        return ResponseEntity.noContent().build();
    }
}
