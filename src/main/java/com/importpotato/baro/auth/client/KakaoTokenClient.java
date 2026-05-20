package com.importpotato.baro.auth.client;

import com.importpotato.baro.auth.dto.KakaoTokenResponse;
import com.importpotato.baro.auth.exception.KakaoTokenRequestException;
import com.importpotato.baro.auth.support.KakaoOAuthProperties;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class KakaoTokenClient {

    private static final String AUTHORIZATION_CODE_GRANT_TYPE = "authorization_code";

    private final RestClient restClient;
    private final KakaoOAuthProperties kakaoOAuthProperties;

    public KakaoTokenClient(RestClient.Builder restClientBuilder, KakaoOAuthProperties kakaoOAuthProperties) {
        this.restClient = restClientBuilder.build();
        this.kakaoOAuthProperties = kakaoOAuthProperties;
    }

    public KakaoTokenResponse requestToken(String code) {
        MultiValueMap<String, String> requestBody = new LinkedMultiValueMap<>();
        requestBody.add("grant_type", AUTHORIZATION_CODE_GRANT_TYPE);
        requestBody.add("client_id", kakaoOAuthProperties.getClientId());
        requestBody.add("redirect_uri", kakaoOAuthProperties.getRedirectUri());
        requestBody.add("code", code);

        if (StringUtils.hasText(kakaoOAuthProperties.getClientSecret())) {
            requestBody.add("client_secret", kakaoOAuthProperties.getClientSecret());
        }

        try {
            return restClient.post()
                    .uri(kakaoOAuthProperties.getTokenUri())
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(requestBody)
                    .retrieve()
                    .body(KakaoTokenResponse.class);
        } catch (RestClientResponseException exception) {
            throw new KakaoTokenRequestException("카카오 토큰 요청에 실패했습니다.", exception);
        } catch (RestClientException exception) {
            throw new KakaoTokenRequestException("카카오 토큰 서버와 통신할 수 없습니다.", exception);
        }
    }
}
