package com.importpotato.baro.auth.service;

import com.importpotato.baro.auth.domain.KakaoUser;
import com.importpotato.baro.auth.dto.KakaoUserInfoResponse;
import com.importpotato.baro.auth.repository.KakaoUserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class KakaoUserRegistrationService {

    private final KakaoUserRepository kakaoUserRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public KakaoUser register(KakaoUserInfoResponse userInfo) {
        return kakaoUserRepository.saveAndFlush(KakaoUser.from(userInfo));
    }
}
