package com.importpotato.baro.store.service;

import com.importpotato.baro.store.domain.Store;
import com.importpotato.baro.store.dto.StoreBasicInfoRequest;
import com.importpotato.baro.store.dto.StoreBasicInfoResponse;
import com.importpotato.baro.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class StoreService {

    private final StoreRepository storeRepository;

    @Transactional
    public StoreBasicInfoResponse createBasicInfo(StoreBasicInfoRequest request) {
        Long userId = getCurrentUserId();
        Store store = Store.createBasicInfo(userId, request.storeName(), request.businessType(), request.category());
        Store savedStore = storeRepository.save(store);

        return StoreBasicInfoResponse.from(savedStore);
    }

    private Long getCurrentUserId() {
        return 1L;
    }
}
