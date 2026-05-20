package com.importpotato.baro.auth.service;

import com.importpotato.baro.auth.client.KakaoTokenClient;
import com.importpotato.baro.auth.client.KakaoUserInfoClient;
import com.importpotato.baro.auth.domain.KakaoUser;
import com.importpotato.baro.auth.dto.KakaoLoginResponse;
import com.importpotato.baro.auth.dto.KakaoTokenResponse;
import com.importpotato.baro.auth.dto.KakaoUserInfoResponse;
import com.importpotato.baro.auth.repository.KakaoUserRepository;
import com.importpotato.baro.auth.support.KakaoOAuthProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class KakaoAuthServiceTest {

    @Mock
    private KakaoTokenClient kakaoTokenClient;

    @Mock
    private KakaoUserInfoClient kakaoUserInfoClient;

    @Mock
    private KakaoUserRepository kakaoUserRepository;

    private final KakaoOAuthProperties kakaoOAuthProperties = kakaoOAuthProperties();

    @Test
    void loginWithAuthorizationCodeRequestsUserInfoAndStoresKakaoUser() {
        KakaoAuthService service = new KakaoAuthService(
                kakaoOAuthProperties,
                kakaoTokenClient,
                kakaoUserInfoClient,
                kakaoUserRepository
        );
        KakaoTokenResponse tokenResponse = new KakaoTokenResponse(
                "bearer",
                "access-token",
                null,
                43199,
                "refresh-token",
                5184000,
                "account_email profile"
        );
        KakaoUserInfoResponse userInfo = new KakaoUserInfoResponse(
                123456789L,
                Instant.parse("2026-05-21T00:00:00Z"),
                new KakaoUserInfoResponse.KakaoAccount(
                        "user@example.com",
                        true,
                        true,
                        new KakaoUserInfoResponse.Profile(
                                "baro",
                                "https://example.com/thumb.jpg",
                                "https://example.com/profile.jpg"
                        )
                )
        );
        given(kakaoTokenClient.requestToken("authorize-code")).willReturn(tokenResponse);
        given(kakaoUserInfoClient.requestUserInfo("access-token")).willReturn(userInfo);
        given(kakaoUserRepository.findByKakaoId(123456789L)).willReturn(Optional.empty());
        given(kakaoUserRepository.save(org.mockito.ArgumentMatchers.any(KakaoUser.class)))
                .willAnswer(invocation -> invocation.getArgument(0));

        KakaoLoginResponse response = service.loginWithAuthorizationCode("authorize-code");

        ArgumentCaptor<KakaoUser> kakaoUserCaptor = ArgumentCaptor.forClass(KakaoUser.class);
        verify(kakaoUserRepository).save(kakaoUserCaptor.capture());
        KakaoUser savedUser = kakaoUserCaptor.getValue();
        assertThat(savedUser.getKakaoId()).isEqualTo(123456789L);
        assertThat(savedUser.getEmail()).isEqualTo("user@example.com");
        assertThat(savedUser.getNickname()).isEqualTo("baro");
        assertThat(response.token().accessToken()).isEqualTo("access-token");
        assertThat(response.user().kakaoId()).isEqualTo(123456789L);
    }

    private static KakaoOAuthProperties kakaoOAuthProperties() {
        KakaoOAuthProperties properties = new KakaoOAuthProperties();
        properties.setClientId("test-rest-api-key");
        properties.setRedirectUri("http://localhost:8080/api/v1/auth/kakao/callback");
        return properties;
    }
}
