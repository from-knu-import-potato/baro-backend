package com.importpotato.baro.auth.dto;

import com.importpotato.baro.auth.domain.KakaoUser;

import java.time.Instant;

public record KakaoUserResponse(
        Long id,
        Long kakaoId,
        String email,
        String nickname,
        String thumbnailImageUrl,
        String profileImageUrl,
        Instant connectedAt,
        Instant lastLoginAt
) {

    public static KakaoUserResponse from(KakaoUser kakaoUser) {
        return new KakaoUserResponse(
                kakaoUser.getId(),
                kakaoUser.getKakaoId(),
                kakaoUser.getEmail(),
                kakaoUser.getNickname(),
                kakaoUser.getThumbnailImageUrl(),
                kakaoUser.getProfileImageUrl(),
                kakaoUser.getConnectedAt(),
                kakaoUser.getLastLoginAt()
        );
    }
}
