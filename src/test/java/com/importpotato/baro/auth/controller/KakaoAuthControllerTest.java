package com.importpotato.baro.auth.controller;

import com.importpotato.baro.auth.client.KakaoTokenClient;
import com.importpotato.baro.auth.client.KakaoUserInfoClient;
import com.importpotato.baro.auth.repository.KakaoUserRepository;
import com.importpotato.baro.auth.service.KakaoAuthService;
import com.importpotato.baro.auth.service.KakaoUserRegistrationService;
import com.importpotato.baro.auth.support.KakaoOAuthProperties;
import com.importpotato.baro.config.SecurityConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(
        controllers = KakaoAuthController.class,
        properties = {
                "kakao.oauth.client-id=test-rest-api-key",
                "kakao.oauth.redirect-uri=http://localhost:8080/api/v1/auth/kakao/callback"
        }
)
@Import({KakaoAuthService.class, KakaoOAuthProperties.class, SecurityConfig.class})
class KakaoAuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private KakaoTokenClient kakaoTokenClient;

    @MockitoBean
    private KakaoUserInfoClient kakaoUserInfoClient;

    @MockitoBean
    private KakaoUserRepository kakaoUserRepository;

    @MockitoBean
    private KakaoUserRegistrationService kakaoUserRegistrationService;

    @Test
    void requestKakaoLoginRedirectsToKakaoAuthorizationUri() throws Exception {
        mockMvc.perform(get("/api/v1/auth/kakao/login")
                        .param("state", "sample-state"))
                .andExpect(status().isFound())
                .andExpect(header().string("Location", containsString("https://kauth.kakao.com/oauth/authorize")))
                .andExpect(header().string("Location", containsString("response_type=code")))
                .andExpect(header().string("Location", containsString("client_id=test-rest-api-key")))
                .andExpect(header().string("Location", containsString("redirect_uri=http://localhost:8080/api/v1/auth/kakao/callback")))
                .andExpect(header().string("Location", containsString("state=sample-state")));
    }

}
