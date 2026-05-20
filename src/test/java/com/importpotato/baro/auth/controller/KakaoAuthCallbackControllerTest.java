package com.importpotato.baro.auth.controller;

import com.importpotato.baro.auth.dto.KakaoLoginResult;
import com.importpotato.baro.auth.dto.KakaoLoginResponse;
import com.importpotato.baro.auth.dto.KakaoTokenResponse;
import com.importpotato.baro.auth.dto.KakaoUserResponse;
import com.importpotato.baro.auth.exception.InvalidKakaoAuthorizationCodeException;
import com.importpotato.baro.auth.service.KakaoAuthService;
import com.importpotato.baro.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(controllers = KakaoAuthController.class)
@Import(SecurityConfig.class)
class KakaoAuthCallbackControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private KakaoAuthService kakaoAuthService;

    @Test
    void handleKakaoCallbackReturnsOkForExistingUserLogin() throws Exception {
        given(kakaoAuthService.loginWithAuthorizationCode("authorize-code"))
                .willReturn(new KakaoLoginResult(new KakaoLoginResponse(
                        new KakaoTokenResponse(
                                "bearer",
                                "access-token",
                                null,
                                43199,
                                "refresh-token",
                                5184000,
                                "account_email profile"
                        ),
                        new KakaoUserResponse(
                                1L,
                                123456789L,
                                "user@example.com",
                                "baro",
                                "https://example.com/thumb.jpg",
                                "https://example.com/profile.jpg",
                                Instant.parse("2026-05-21T00:00:00Z"),
                                Instant.parse("2026-05-21T00:01:00Z")
                        )
                ), false));

        mockMvc.perform(get("/api/v1/auth/kakao/callback")
                        .param("code", "authorize-code"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token.token_type").value("bearer"))
                .andExpect(jsonPath("$.token.access_token").value("access-token"))
                .andExpect(jsonPath("$.token.expires_in").value(43199))
                .andExpect(jsonPath("$.token.refresh_token").value("refresh-token"))
                .andExpect(jsonPath("$.token.refresh_token_expires_in").value(5184000))
                .andExpect(jsonPath("$.token.scope").value("account_email profile"))
                .andExpect(jsonPath("$.user.kakaoId").value(123456789L))
                .andExpect(jsonPath("$.user.email").value("user@example.com"))
                .andExpect(jsonPath("$.user.nickname").value("baro"));
    }

    @Test
    void handleKakaoCallbackReturnsCreatedForNewUserRegistration() throws Exception {
        given(kakaoAuthService.loginWithAuthorizationCode("authorize-code"))
                .willReturn(new KakaoLoginResult(new KakaoLoginResponse(
                        new KakaoTokenResponse(
                                "bearer",
                                "access-token",
                                null,
                                43199,
                                "refresh-token",
                                5184000,
                                "account_email profile"
                        ),
                        new KakaoUserResponse(
                                1L,
                                123456789L,
                                "user@example.com",
                                "baro",
                                "https://example.com/thumb.jpg",
                                "https://example.com/profile.jpg",
                                Instant.parse("2026-05-21T00:00:00Z"),
                                Instant.parse("2026-05-21T00:01:00Z")
                        )
                ), true));

        mockMvc.perform(get("/api/v1/auth/kakao/callback")
                        .param("code", "authorize-code"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.kakaoId").value(123456789L));
    }

    @Test
    void handleKakaoCallbackReturnsBadRequestWhenCodeIsBlank() throws Exception {
        given(kakaoAuthService.loginWithAuthorizationCode(""))
                .willThrow(new InvalidKakaoAuthorizationCodeException());

        mockMvc.perform(get("/api/v1/auth/kakao/callback")
                        .param("code", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid Kakao authorization code"))
                .andExpect(jsonPath("$.detail").value("code parameter is required."));
    }
}
