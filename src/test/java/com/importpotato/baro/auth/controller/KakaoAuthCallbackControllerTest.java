package com.importpotato.baro.auth.controller;

import com.importpotato.baro.auth.dto.KakaoTokenResponse;
import com.importpotato.baro.auth.exception.InvalidKakaoAuthorizationCodeException;
import com.importpotato.baro.auth.service.KakaoAuthService;
import com.importpotato.baro.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

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
    void handleKakaoCallbackReturnsTokenResponse() throws Exception {
        given(kakaoAuthService.exchangeAuthorizationCode("authorize-code"))
                .willReturn(new KakaoTokenResponse(
                        "bearer",
                        "access-token",
                        null,
                        43199,
                        "refresh-token",
                        5184000,
                        "account_email profile"
                ));

        mockMvc.perform(get("/api/v1/auth/kakao/callback")
                        .param("code", "authorize-code"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token_type").value("bearer"))
                .andExpect(jsonPath("$.access_token").value("access-token"))
                .andExpect(jsonPath("$.expires_in").value(43199))
                .andExpect(jsonPath("$.refresh_token").value("refresh-token"))
                .andExpect(jsonPath("$.refresh_token_expires_in").value(5184000))
                .andExpect(jsonPath("$.scope").value("account_email profile"));
    }

    @Test
    void handleKakaoCallbackReturnsBadRequestWhenCodeIsBlank() throws Exception {
        given(kakaoAuthService.exchangeAuthorizationCode(""))
                .willThrow(new InvalidKakaoAuthorizationCodeException());

        mockMvc.perform(get("/api/v1/auth/kakao/callback")
                        .param("code", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.title").value("Invalid Kakao authorization code"))
                .andExpect(jsonPath("$.detail").value("code 파라미터가 필요합니다."));
    }
}
