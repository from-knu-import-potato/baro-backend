package com.importpotato.baro.store.service;

import com.importpotato.baro.store.domain.Store;
import com.importpotato.baro.store.dto.StoreBasicInfoRequest;
import com.importpotato.baro.store.dto.StoreBasicInfoResponse;
import com.importpotato.baro.store.dto.StoreBusinessHoursRequest;
import com.importpotato.baro.store.dto.StoreBusinessHoursResponse;
import com.importpotato.baro.store.exception.InvalidBusinessHoursException;
import com.importpotato.baro.store.exception.StoreNotFoundException;
import com.importpotato.baro.store.repository.StoreRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalTime;

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

    @Transactional(readOnly = true)
    public StoreBusinessHoursResponse getBusinessHours(Long storeId) {
        Store store = findStore(storeId);

        return StoreBusinessHoursResponse.from(store);
    }

    @Transactional
    public StoreBusinessHoursResponse updateBusinessHours(Long storeId, StoreBusinessHoursRequest request) {
        Store store = findStore(storeId);

        BusinessHour mon = validateAndNormalize("mon", request.monOpen(), request.monClose(), request.monClosed());
        BusinessHour tue = validateAndNormalize("tue", request.tueOpen(), request.tueClose(), request.tueClosed());
        BusinessHour wed = validateAndNormalize("wed", request.wedOpen(), request.wedClose(), request.wedClosed());
        BusinessHour thu = validateAndNormalize("thu", request.thuOpen(), request.thuClose(), request.thuClosed());
        BusinessHour fri = validateAndNormalize("fri", request.friOpen(), request.friClose(), request.friClosed());
        BusinessHour sat = validateAndNormalize("sat", request.satOpen(), request.satClose(), request.satClosed());
        BusinessHour sun = validateAndNormalize("sun", request.sunOpen(), request.sunClose(), request.sunClosed());

        store.updateBusinessHours(
                mon.open(), mon.close(), mon.closed(),
                tue.open(), tue.close(), tue.closed(),
                wed.open(), wed.close(), wed.closed(),
                thu.open(), thu.close(), thu.closed(),
                fri.open(), fri.close(), fri.closed(),
                sat.open(), sat.close(), sat.closed(),
                sun.open(), sun.close(), sun.closed()
        );

        return StoreBusinessHoursResponse.from(store);
    }

    private Store findStore(Long storeId) {
        return storeRepository.findById(storeId)
                .orElseThrow(() -> new StoreNotFoundException(storeId));
    }

    private BusinessHour validateAndNormalize(String day, LocalTime open, LocalTime close, Boolean closed) {
        if (Boolean.TRUE.equals(closed)) {
            return new BusinessHour(null, null, true);
        }

        if (open == null || close == null) {
            throw new InvalidBusinessHoursException(day + " open and close are required when closed is false");
        }

        if (open.isAfter(close)) {
            throw new InvalidBusinessHoursException(day + " open must not be after close");
        }

        return new BusinessHour(open, close, false);
    }

    private Long getCurrentUserId() {
        return 1L;
    }

    private record BusinessHour(LocalTime open, LocalTime close, Boolean closed) {
    }
}
