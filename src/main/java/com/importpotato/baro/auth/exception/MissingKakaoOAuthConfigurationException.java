package com.importpotato.baro.auth.exception;

public class MissingKakaoOAuthConfigurationException extends RuntimeException {

    public MissingKakaoOAuthConfigurationException(String propertyName) {
        super(propertyName + " configuration is required.");
    }
}
