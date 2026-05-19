package com.importpotato.baro.auth.service;

import com.importpotato.baro.auth.support.KakaoOAuthProperties;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;

@Service
public class KakaoAuthService {

    private final KakaoOAuthProperties kakaoOAuthProperties;

    public KakaoAuthService(KakaoOAuthProperties kakaoOAuthProperties) {
        this.kakaoOAuthProperties = kakaoOAuthProperties;
    }

    public URI createAuthorizationRedirectUri(String state) {
        if (!StringUtils.hasText(kakaoOAuthProperties.getClientId())) {
            throw new IllegalStateException("kakao.oauth.client-id 설정이 필요합니다.");
        }
        if (!StringUtils.hasText(kakaoOAuthProperties.getRedirectUri())) {
            throw new IllegalStateException("kakao.oauth.redirect-uri 설정이 필요합니다.");
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
}
