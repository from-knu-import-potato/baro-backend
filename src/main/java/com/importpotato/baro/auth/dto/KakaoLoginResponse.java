package com.importpotato.baro.auth.dto;

public record KakaoLoginResponse(
        KakaoTokenResponse token,
        KakaoUserResponse user
) {
}
