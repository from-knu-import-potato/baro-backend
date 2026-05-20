package com.importpotato.baro.auth.domain;

import com.importpotato.baro.auth.dto.KakaoUserInfoResponse;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

@Entity
@Table(name = "kakao_users")
public class KakaoUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private Long kakaoId;

    private String email;

    private String nickname;

    private String thumbnailImageUrl;

    private String profileImageUrl;

    private Instant connectedAt;

    @Column(nullable = false)
    private Instant lastLoginAt;

    protected KakaoUser() {
    }

    private KakaoUser(Long kakaoId) {
        this.kakaoId = kakaoId;
    }

    public static KakaoUser from(KakaoUserInfoResponse userInfo) {
        KakaoUser kakaoUser = new KakaoUser(userInfo.id());
        kakaoUser.update(userInfo);
        return kakaoUser;
    }

    public void update(KakaoUserInfoResponse userInfo) {
        this.email = userInfo.email();
        this.nickname = userInfo.nickname();
        this.thumbnailImageUrl = userInfo.thumbnailImageUrl();
        this.profileImageUrl = userInfo.profileImageUrl();
        this.connectedAt = userInfo.connectedAt();
        this.lastLoginAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public Long getKakaoId() {
        return kakaoId;
    }

    public String getEmail() {
        return email;
    }

    public String getNickname() {
        return nickname;
    }

    public String getThumbnailImageUrl() {
        return thumbnailImageUrl;
    }

    public String getProfileImageUrl() {
        return profileImageUrl;
    }

    public Instant getConnectedAt() {
        return connectedAt;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }
}
