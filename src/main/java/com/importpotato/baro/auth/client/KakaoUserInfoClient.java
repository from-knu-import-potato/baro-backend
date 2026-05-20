package com.importpotato.baro.auth.client;

import com.importpotato.baro.auth.dto.KakaoUserInfoResponse;
import com.importpotato.baro.auth.exception.KakaoUserInfoRequestException;
import com.importpotato.baro.auth.support.KakaoOAuthProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class KakaoUserInfoClient {

    private final RestClient restClient;
    private final KakaoOAuthProperties kakaoOAuthProperties;

    public KakaoUserInfoClient(RestClient.Builder restClientBuilder, KakaoOAuthProperties kakaoOAuthProperties) {
        this.restClient = restClientBuilder.build();
        this.kakaoOAuthProperties = kakaoOAuthProperties;
    }

    public KakaoUserInfoResponse requestUserInfo(String accessToken) {
        try {
            return restClient.get()
                    .uri(kakaoOAuthProperties.getUserInfoUri())
                    .headers(headers -> headers.setBearerAuth(accessToken))
                    .retrieve()
                    .body(KakaoUserInfoResponse.class);
        } catch (RestClientResponseException exception) {
            throw new KakaoUserInfoRequestException(
                    "카카오 사용자 정보 요청에 실패했습니다.",
                    exception.getStatusCode(),
                    exception.getResponseBodyAsString(),
                    exception
            );
        } catch (RestClientException exception) {
            throw new KakaoUserInfoRequestException("카카오 사용자 정보 서버와 통신할 수 없습니다.", exception);
        }
    }
}
