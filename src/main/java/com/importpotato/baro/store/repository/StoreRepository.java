package com.importpotato.baro.store.repository;

import com.importpotato.baro.store.domain.Store;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreRepository extends JpaRepository<Store, Long> {
}
