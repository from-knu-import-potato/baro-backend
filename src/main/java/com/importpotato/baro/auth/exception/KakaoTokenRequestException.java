package com.importpotato.baro.auth.exception;

import org.springframework.http.HttpStatusCode;

public class KakaoTokenRequestException extends RuntimeException {

    private final HttpStatusCode kakaoStatusCode;
    private final String kakaoResponseBody;

    public KakaoTokenRequestException(String message, Throwable cause) {
        super(message, cause);
        this.kakaoStatusCode = null;
        this.kakaoResponseBody = null;
    }

    public KakaoTokenRequestException(String message, HttpStatusCode kakaoStatusCode, String kakaoResponseBody, Throwable cause) {
        super(message, cause);
        this.kakaoStatusCode = kakaoStatusCode;
        this.kakaoResponseBody = kakaoResponseBody;
    }

    public HttpStatusCode getKakaoStatusCode() {
        return kakaoStatusCode;
    }

    public String getKakaoResponseBody() {
        return kakaoResponseBody;
    }
}
