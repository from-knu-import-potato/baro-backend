package com.importpotato.baro.auth.controller;

import com.importpotato.baro.auth.client.KakaoTokenClient;
import com.importpotato.baro.auth.client.KakaoUserInfoClient;
import com.importpotato.baro.auth.repository.KakaoUserRepository;
import com.importpotato.baro.auth.service.KakaoAuthService;
import com.importpotato.baro.auth.support.KakaoOAuthProperties;
import com.importpotato.baro.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(
        controllers = KakaoAuthController.class,
        properties = {
                "kakao.oauth.client-id=",
                "kakao.oauth.redirect-uri=http://localhost:8080/api/v1/auth/kakao/callback"
        }
)
@Import({KakaoAuthService.class, KakaoOAuthProperties.class, SecurityConfig.class})
class KakaoAuthControllerMissingConfigurationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private KakaoTokenClient kakaoTokenClient;

    @MockitoBean
    private KakaoUserInfoClient kakaoUserInfoClient;

    @MockitoBean
    private KakaoUserRepository kakaoUserRepository;

    @Test
    void requestKakaoLoginReturnsServiceUnavailableWhenClientIdIsMissing() throws Exception {
        mockMvc.perform(get("/api/v1/auth/kakao/login"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.title").value("Kakao OAuth configuration is missing"))
                .andExpect(jsonPath("$.detail").value("kakao.oauth.client-id configuration is required."));
    }
}
