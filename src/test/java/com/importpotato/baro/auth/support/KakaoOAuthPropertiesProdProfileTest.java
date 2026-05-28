package com.importpotato.baro.auth.support;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties = {
        "spring.profiles.active=prod",
        "spring.ai.openai.api-key=",
        "spring.datasource.url=jdbc:h2:mem:prod-profile-testdb",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "KAKAO_REST_API_KEY=test-render-rest-api-key",
        "KAKAO_REDIRECT_URI=https://baro.example.com/api/v1/auth/kakao/callback"
})
class KakaoOAuthPropertiesProdProfileTest {

    @Autowired
    private KakaoOAuthProperties kakaoOAuthProperties;

    @Test
    void prodProfileBindsKakaoRestApiKeyToClientId() {
        assertThat(kakaoOAuthProperties.getClientId()).isEqualTo("test-render-rest-api-key");
        assertThat(kakaoOAuthProperties.getRedirectUri())
                .isEqualTo("https://baro.example.com/api/v1/auth/kakao/callback");
    }
}
