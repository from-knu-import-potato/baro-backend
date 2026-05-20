package com.importpotato.baro.auth.repository;

import com.importpotato.baro.auth.domain.KakaoUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface KakaoUserRepository extends JpaRepository<KakaoUser, Long> {

    Optional<KakaoUser> findByKakaoId(Long kakaoId);
}
