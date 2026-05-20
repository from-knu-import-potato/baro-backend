package com.importpotato.baro.auth.support;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "kakao.oauth")
public class KakaoOAuthProperties {

    private String authorizationUri = "https://kauth.kakao.com/oauth/authorize";
    private String tokenUri = "https://kauth.kakao.com/oauth/token";
    private String userInfoUri = "https://kapi.kakao.com/v2/user/me";
    private String clientId;
    private String clientSecret;
    private String redirectUri;

    public String getAuthorizationUri() {
        return authorizationUri;
    }

    public void setAuthorizationUri(String authorizationUri) {
        this.authorizationUri = authorizationUri;
    }

    public String getTokenUri() {
        return tokenUri;
    }

    public void setTokenUri(String tokenUri) {
        this.tokenUri = tokenUri;
    }

    public String getUserInfoUri() {
        return userInfoUri;
    }

    public void setUserInfoUri(String userInfoUri) {
        this.userInfoUri = userInfoUri;
    }

    public String getClientId() {
        return clientId;
    }

    public void setClientId(String clientId) {
        this.clientId = clientId;
    }

    public String getClientSecret() {
        return clientSecret;
    }

    public void setClientSecret(String clientSecret) {
        this.clientSecret = clientSecret;
    }

    public String getRedirectUri() {
        return redirectUri;
    }

    public void setRedirectUri(String redirectUri) {
        this.redirectUri = redirectUri;
    }
}
