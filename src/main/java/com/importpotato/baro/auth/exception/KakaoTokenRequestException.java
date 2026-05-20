package com.importpotato.baro.auth.exception;

import org.springframework.http.HttpStatusCode;

public class KakaoTokenRequestException extends RuntimeException {

    public KakaoTokenRequestException(String message, Throwable cause) {
        super(message, cause);
    }

    public KakaoTokenRequestException(String message, HttpStatusCode kakaoStatusCode, String kakaoResponseBody, Throwable cause) {
        super(message, cause);
        this.kakaoStatusCode = kakaoStatusCode;
        this.kakaoResponseBody = kakaoResponseBody;
    }

    private HttpStatusCode kakaoStatusCode;
    private String kakaoResponseBody;

    public HttpStatusCode getKakaoStatusCode() {
        return kakaoStatusCode;
    }

    public String getKakaoResponseBody() {
        return kakaoResponseBody;
    }
}
