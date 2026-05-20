package com.importpotato.baro.auth.exception;

import org.springframework.http.HttpStatusCode;

public class KakaoUserInfoRequestException extends RuntimeException {

    private final HttpStatusCode kakaoStatusCode;
    private final String kakaoResponseBody;

    public KakaoUserInfoRequestException(String message, Throwable cause) {
        super(message, cause);
        this.kakaoStatusCode = null;
        this.kakaoResponseBody = null;
    }

    public KakaoUserInfoRequestException(String message, HttpStatusCode kakaoStatusCode, String kakaoResponseBody, Throwable cause) {
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
