package com.importpotato.baro.store.dto;

import com.importpotato.baro.store.domain.BusinessType;
import com.importpotato.baro.store.domain.StoreCategory;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record StoreBasicInfoRequest(
        @NotBlank(message = "storeName is required")
        @Size(max = 100, message = "storeName must not exceed 100 characters")
        String storeName,

        @NotNull(message = "businessType is required")
        BusinessType businessType,

        @NotNull(message = "category is required")
        StoreCategory category
) {
}
