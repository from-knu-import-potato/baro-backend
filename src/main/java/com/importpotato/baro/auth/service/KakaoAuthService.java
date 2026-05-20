package com.importpotato.baro.auth.service;

import com.importpotato.baro.auth.client.KakaoTokenClient;
import com.importpotato.baro.auth.client.KakaoUserInfoClient;
import com.importpotato.baro.auth.domain.KakaoUser;
import com.importpotato.baro.auth.dto.KakaoLoginResult;
import com.importpotato.baro.auth.dto.KakaoLoginResponse;
import com.importpotato.baro.auth.dto.KakaoTokenResponse;
import com.importpotato.baro.auth.dto.KakaoUserInfoResponse;
import com.importpotato.baro.auth.dto.KakaoUserResponse;
import com.importpotato.baro.auth.exception.InvalidKakaoAuthorizationCodeException;
import com.importpotato.baro.auth.exception.KakaoUserInfoRequestException;
import com.importpotato.baro.auth.exception.MissingKakaoOAuthConfigurationException;
import com.importpotato.baro.auth.repository.KakaoUserRepository;
import com.importpotato.baro.auth.support.KakaoOAuthProperties;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

@Service
public class KakaoAuthService {

    private final KakaoOAuthProperties kakaoOAuthProperties;
    private final KakaoTokenClient kakaoTokenClient;
    private final KakaoUserInfoClient kakaoUserInfoClient;
    private final KakaoUserRepository kakaoUserRepository;
    private final KakaoUserRegistrationService kakaoUserRegistrationService;

    public KakaoAuthService(
            KakaoOAuthProperties kakaoOAuthProperties,
            KakaoTokenClient kakaoTokenClient,
            KakaoUserInfoClient kakaoUserInfoClient,
            KakaoUserRepository kakaoUserRepository,
            KakaoUserRegistrationService kakaoUserRegistrationService
    ) {
        this.kakaoOAuthProperties = kakaoOAuthProperties;
        this.kakaoTokenClient = kakaoTokenClient;
        this.kakaoUserInfoClient = kakaoUserInfoClient;
        this.kakaoUserRepository = kakaoUserRepository;
        this.kakaoUserRegistrationService = kakaoUserRegistrationService;
    }

    public URI createAuthorizationRedirectUri(String state) {
        if (!StringUtils.hasText(kakaoOAuthProperties.getClientId())) {
            throw new MissingKakaoOAuthConfigurationException("kakao.oauth.client-id");
        }
        if (!StringUtils.hasText(kakaoOAuthProperties.getRedirectUri())) {
            throw new MissingKakaoOAuthConfigurationException("kakao.oauth.redirect-uri");
        }

        UriComponentsBuilder uriBuilder = UriComponentsBuilder
                .fromUriString(kakaoOAuthProperties.getAuthorizationUri())
                .queryParam("response_type", "code")
                .queryParam("client_id", kakaoOAuthProperties.getClientId())
                .queryParam("redirect_uri", kakaoOAuthProperties.getRedirectUri());

        if (StringUtils.hasText(state)) {
            uriBuilder.queryParam("state", state);
        }

        return uriBuilder.build(true).toUri();
    }

    @Transactional
    public KakaoLoginResult loginWithAuthorizationCode(String code) {
        if (!StringUtils.hasText(code)) {
            throw new InvalidKakaoAuthorizationCodeException();
        }
        validateTokenRequestConfiguration();

        KakaoTokenResponse tokenResponse = kakaoTokenClient.requestToken(code);
        if (!StringUtils.hasText(tokenResponse.accessToken())) {
            throw new KakaoUserInfoRequestException("카카오 액세스 토큰이 비어 있습니다.", null);
        }

        KakaoUserInfoResponse userInfo = kakaoUserInfoClient.requestUserInfo(tokenResponse.accessToken());
        LoginUser loginUser = loginOrRegister(userInfo);

        return new KakaoLoginResult(
                new KakaoLoginResponse(tokenResponse, KakaoUserResponse.from(loginUser.kakaoUser())),
                loginUser.registered()
        );
    }

    private LoginUser loginOrRegister(KakaoUserInfoResponse userInfo) {
        try {
            return new LoginUser(kakaoUserRegistrationService.register(userInfo), true);
        } catch (DataIntegrityViolationException exception) {
            KakaoUser kakaoUser = kakaoUserRepository.findByKakaoId(userInfo.id())
                    .orElseThrow(() -> exception);

            kakaoUser.update(userInfo);
            return new LoginUser(kakaoUser, false);
        }
    }

    private void validateTokenRequestConfiguration() {
        if (!StringUtils.hasText(kakaoOAuthProperties.getClientId())) {
            throw new MissingKakaoOAuthConfigurationException("kakao.oauth.client-id");
        }
        if (!StringUtils.hasText(kakaoOAuthProperties.getRedirectUri())) {
            throw new MissingKakaoOAuthConfigurationException("kakao.oauth.redirect-uri");
        }
        if (!StringUtils.hasText(kakaoOAuthProperties.getTokenUri())) {
            throw new MissingKakaoOAuthConfigurationException("kakao.oauth.token-uri");
        }
        if (!StringUtils.hasText(kakaoOAuthProperties.getUserInfoUri())) {
            throw new MissingKakaoOAuthConfigurationException("kakao.oauth.user-info-uri");
        }
    }

    private record LoginUser(
            KakaoUser kakaoUser,
            boolean registered
    ) {
    }
}
