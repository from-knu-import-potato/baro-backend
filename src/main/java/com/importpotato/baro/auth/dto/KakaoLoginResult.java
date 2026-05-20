package com.importpotato.baro.auth.dto;

public record KakaoLoginResult(
        KakaoLoginResponse response,
        boolean registered
) {
}
