package com.importpotato.baro.auth.exception;

public class InvalidKakaoAuthorizationCodeException extends RuntimeException {

    public InvalidKakaoAuthorizationCodeException() {
        super("code parameter is required.");
    }
}
