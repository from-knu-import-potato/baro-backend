package com.importpotato.baro.auth.service;

import com.importpotato.baro.auth.client.KakaoTokenClient;
import com.importpotato.baro.auth.dto.KakaoTokenResponse;
import com.importpotato.baro.auth.exception.InvalidKakaoAuthorizationCodeException;
import com.importpotato.baro.auth.exception.MissingKakaoOAuthConfigurationException;
import com.importpotato.baro.auth.support.KakaoOAuthProperties;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

@Service
public class KakaoAuthService {

    private final KakaoOAuthProperties kakaoOAuthProperties;
    private final KakaoTokenClient kakaoTokenClient;

    public KakaoAuthService(KakaoOAuthProperties kakaoOAuthProperties, KakaoTokenClient kakaoTokenClient) {
        this.kakaoOAuthProperties = kakaoOAuthProperties;
        this.kakaoTokenClient = kakaoTokenClient;
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

    public KakaoTokenResponse exchangeAuthorizationCode(String code) {
        if (!StringUtils.hasText(code)) {
            throw new InvalidKakaoAuthorizationCodeException();
        }
        validateTokenRequestConfiguration();

        return kakaoTokenClient.requestToken(code);
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
    }
}
