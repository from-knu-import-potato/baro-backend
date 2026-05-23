package com.importpotato.baro.store.repository;

import com.importpotato.baro.store.domain.Store;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface StoreRepository extends JpaRepository<Store, Long> {

    Optional<Store> findByIdAndUserId(Long id, Long userId);
}
