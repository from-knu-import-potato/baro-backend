package com.importpotato.baro.common.exception;

import com.importpotato.baro.auth.exception.InvalidKakaoAuthorizationCodeException;
import com.importpotato.baro.auth.exception.KakaoTokenRequestException;
import com.importpotato.baro.auth.exception.KakaoUserInfoRequestException;
import com.importpotato.baro.auth.exception.MissingKakaoOAuthConfigurationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MissingKakaoOAuthConfigurationException.class)
    public ProblemDetail handleMissingKakaoOAuthConfiguration(MissingKakaoOAuthConfigurationException exception) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, exception.getMessage());
        problemDetail.setTitle("Kakao OAuth configuration is missing");
        return problemDetail;
    }

    @ExceptionHandler(InvalidKakaoAuthorizationCodeException.class)
    public ProblemDetail handleInvalidKakaoAuthorizationCode(InvalidKakaoAuthorizationCodeException exception) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage());
        problemDetail.setTitle("Invalid Kakao authorization code");
        return problemDetail;
    }

    @ExceptionHandler(KakaoTokenRequestException.class)
    public ProblemDetail handleKakaoTokenRequest(KakaoTokenRequestException exception) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, exception.getMessage());
        problemDetail.setTitle("Kakao token request failed");
        if (exception.getKakaoStatusCode() != null) {
            problemDetail.setProperty("kakaoStatus", exception.getKakaoStatusCode().value());
        }
        if (exception.getKakaoResponseBody() != null && !exception.getKakaoResponseBody().isBlank()) {
            problemDetail.setProperty("kakaoError", exception.getKakaoResponseBody());
        }
        return problemDetail;
    }

    @ExceptionHandler(KakaoUserInfoRequestException.class)
    public ProblemDetail handleKakaoUserInfoRequest(KakaoUserInfoRequestException exception) {
        ProblemDetail problemDetail = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, exception.getMessage());
        problemDetail.setTitle("Kakao user info request failed");
        if (exception.getKakaoStatusCode() != null) {
            problemDetail.setProperty("kakaoStatus", exception.getKakaoStatusCode().value());
        }
        if (exception.getKakaoResponseBody() != null && !exception.getKakaoResponseBody().isBlank()) {
            problemDetail.setProperty("kakaoError", exception.getKakaoResponseBody());
        }
        return problemDetail;
    }
}
