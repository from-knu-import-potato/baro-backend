package com.importpotato.baro.auth.controller;

import com.importpotato.baro.auth.service.KakaoAuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class KakaoAuthController {

    private final KakaoAuthService kakaoAuthService;

    @GetMapping("/kakao/login")
    public ResponseEntity<Void> requestKakaoLogin(
            @RequestParam(required = false) String state
    ) {
        URI kakaoAuthorizeUri = kakaoAuthService.createAuthorizationRedirectUri(state);

        return ResponseEntity.status(HttpStatus.FOUND)
                .location(kakaoAuthorizeUri)
                .build();
    }
}
