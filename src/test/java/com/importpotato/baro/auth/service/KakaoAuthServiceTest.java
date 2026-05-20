package com.importpotato.baro.auth.service;

import com.importpotato.baro.auth.client.KakaoTokenClient;
import com.importpotato.baro.auth.client.KakaoUserInfoClient;
import com.importpotato.baro.auth.domain.KakaoUser;
import com.importpotato.baro.auth.dto.KakaoLoginResult;
import com.importpotato.baro.auth.dto.KakaoLoginResponse;
import com.importpotato.baro.auth.dto.KakaoTokenResponse;
import com.importpotato.baro.auth.dto.KakaoUserInfoResponse;
import com.importpotato.baro.auth.repository.KakaoUserRepository;
import com.importpotato.baro.auth.support.KakaoOAuthProperties;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class KakaoAuthServiceTest {

    @Mock
    private KakaoTokenClient kakaoTokenClient;

    @Mock
    private KakaoUserInfoClient kakaoUserInfoClient;

    @Mock
    private KakaoUserRepository kakaoUserRepository;

    @Mock
    private KakaoUserRegistrationService kakaoUserRegistrationService;

    private final KakaoOAuthProperties kakaoOAuthProperties = kakaoOAuthProperties();

    @Test
    void loginWithAuthorizationCodeRegistersNewKakaoUser() {
        KakaoAuthService service = new KakaoAuthService(
                kakaoOAuthProperties,
                kakaoTokenClient,
                kakaoUserInfoClient,
                kakaoUserRepository,
                kakaoUserRegistrationService
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
        given(kakaoUserRegistrationService.register(userInfo)).willReturn(KakaoUser.from(userInfo));

        KakaoLoginResult result = service.loginWithAuthorizationCode("authorize-code");
        KakaoLoginResponse response = result.response();

        verify(kakaoUserRegistrationService).register(userInfo);
        verify(kakaoUserRepository, never()).findByKakaoId(123456789L);
        assertThat(result.registered()).isTrue();
        assertThat(response.token().accessToken()).isEqualTo("access-token");
        assertThat(response.user().kakaoId()).isEqualTo(123456789L);
        assertThat(response.user().email()).isEqualTo("user@example.com");
        assertThat(response.user().nickname()).isEqualTo("baro");
    }

    @Test
    void loginWithAuthorizationCodeLogsInExistingUserWhenRegistrationConflicts() {
        KakaoAuthService service = new KakaoAuthService(
                kakaoOAuthProperties,
                kakaoTokenClient,
                kakaoUserInfoClient,
                kakaoUserRepository,
                kakaoUserRegistrationService
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
        KakaoUserInfoResponse latestUserInfo = new KakaoUserInfoResponse(
                123456789L,
                Instant.parse("2026-05-21T00:00:00Z"),
                new KakaoUserInfoResponse.KakaoAccount(
                        "latest@example.com",
                        true,
                        true,
                        new KakaoUserInfoResponse.Profile(
                                "latest-baro",
                                "https://example.com/latest-thumb.jpg",
                                "https://example.com/latest-profile.jpg"
                        )
                )
        );
        KakaoUser existingUser = KakaoUser.from(new KakaoUserInfoResponse(
                123456789L,
                Instant.parse("2026-05-20T00:00:00Z"),
                new KakaoUserInfoResponse.KakaoAccount(
                        "old@example.com",
                        true,
                        true,
                        new KakaoUserInfoResponse.Profile(
                                "old-baro",
                                "https://example.com/old-thumb.jpg",
                                "https://example.com/old-profile.jpg"
                        )
                )
        ));
        given(kakaoTokenClient.requestToken("authorize-code")).willReturn(tokenResponse);
        given(kakaoUserInfoClient.requestUserInfo("access-token")).willReturn(latestUserInfo);
        given(kakaoUserRegistrationService.register(latestUserInfo))
                .willThrow(new DataIntegrityViolationException("duplicate kakao id"));
        given(kakaoUserRepository.findByKakaoId(123456789L)).willReturn(Optional.of(existingUser));

        KakaoLoginResult result = service.loginWithAuthorizationCode("authorize-code");

        verify(kakaoUserRegistrationService).register(latestUserInfo);
        verify(kakaoUserRepository).findByKakaoId(123456789L);
        assertThat(result.registered()).isFalse();
        assertThat(result.response().user().email()).isEqualTo("latest@example.com");
        assertThat(result.response().user().nickname()).isEqualTo("latest-baro");
    }

    private static KakaoOAuthProperties kakaoOAuthProperties() {
        KakaoOAuthProperties properties = new KakaoOAuthProperties();
        properties.setClientId("test-rest-api-key");
        properties.setRedirectUri("http://localhost:8080/api/v1/auth/kakao/callback");
        return properties;
    }
}
