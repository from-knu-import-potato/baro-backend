package com.importpotato.baro.auth.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

public record KakaoUserInfoResponse(
        Long id,

        @JsonProperty("connected_at")
        Instant connectedAt,

        @JsonProperty("kakao_account")
        KakaoAccount kakaoAccount
) {

    public String email() {
        return kakaoAccount == null ? null : kakaoAccount.email();
    }

    public String nickname() {
        if (kakaoAccount == null || kakaoAccount.profile() == null) {
            return null;
        }
        return kakaoAccount.profile().nickname();
    }

    public String thumbnailImageUrl() {
        if (kakaoAccount == null || kakaoAccount.profile() == null) {
            return null;
        }
        return kakaoAccount.profile().thumbnailImageUrl();
    }

    public String profileImageUrl() {
        if (kakaoAccount == null || kakaoAccount.profile() == null) {
            return null;
        }
        return kakaoAccount.profile().profileImageUrl();
    }

    public record KakaoAccount(
            String email,

            @JsonProperty("is_email_valid")
            Boolean emailValid,

            @JsonProperty("is_email_verified")
            Boolean emailVerified,

            Profile profile
    ) {
    }

    public record Profile(
            String nickname,

            @JsonProperty("thumbnail_image_url")
            String thumbnailImageUrl,

            @JsonProperty("profile_image_url")
            String profileImageUrl
    ) {
    }
}
