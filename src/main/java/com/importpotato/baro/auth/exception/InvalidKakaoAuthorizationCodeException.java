package com.importpotato.baro.auth.exception;

public class InvalidKakaoAuthorizationCodeException extends RuntimeException {

    public InvalidKakaoAuthorizationCodeException() {
        super("code 파라미터가 필요합니다.");
    }
}
