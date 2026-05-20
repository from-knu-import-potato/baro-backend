package com.importpotato.baro.auth.exception;

public class MissingKakaoOAuthConfigurationException extends RuntimeException {

    public MissingKakaoOAuthConfigurationException(String propertyName) {
        super(propertyName + " 설정이 필요합니다.");
    }
}
