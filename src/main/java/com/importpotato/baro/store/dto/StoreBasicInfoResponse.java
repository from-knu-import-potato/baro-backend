package com.importpotato.baro.store.dto;

import com.importpotato.baro.store.domain.BusinessType;
import com.importpotato.baro.store.domain.Store;
import com.importpotato.baro.store.domain.StoreCategory;

import java.time.LocalDateTime;

public record StoreBasicInfoResponse(
        Long storeId,
        String storeName,
        BusinessType businessType,
        StoreCategory category,
        LocalDateTime created
) {

    public static StoreBasicInfoResponse from(Store store) {
        return new StoreBasicInfoResponse(
                store.getId(),
                store.getStoreName(),
                store.getBusinessType(),
                store.getCategory(),
                store.getCreated()
        );
    }
}
