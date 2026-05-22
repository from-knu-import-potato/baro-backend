package com.importpotato.baro.store.controller;

import com.importpotato.baro.store.dto.StoreBasicInfoRequest;
import com.importpotato.baro.store.dto.StoreBasicInfoResponse;
import com.importpotato.baro.store.dto.StoreBusinessHoursRequest;
import com.importpotato.baro.store.dto.StoreBusinessHoursResponse;
import com.importpotato.baro.store.service.StoreService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/stores")
@RequiredArgsConstructor
public class StoreController {

    private final StoreService storeService;

    @PostMapping("/basic-info")
    public ResponseEntity<StoreBasicInfoResponse> createBasicInfo(
            @Valid @RequestBody StoreBasicInfoRequest request
    ) {
        StoreBasicInfoResponse response = storeService.createBasicInfo(request);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(response);
    }

    @GetMapping("/{storeId}/business-hours")
    public ResponseEntity<StoreBusinessHoursResponse> getBusinessHours(
            @PathVariable Long storeId
    ) {
        StoreBusinessHoursResponse response = storeService.getBusinessHours(storeId);

        return ResponseEntity.ok(response);
    }

    @PutMapping("/{storeId}/business-hours")
    public ResponseEntity<StoreBusinessHoursResponse> updateBusinessHours(
            @PathVariable Long storeId,
            @Valid @RequestBody StoreBusinessHoursRequest request
    ) {
        StoreBusinessHoursResponse response = storeService.updateBusinessHours(storeId, request);

        return ResponseEntity.ok(response);
    }
}
