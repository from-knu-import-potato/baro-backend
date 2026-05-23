package com.importpotato.baro.menu.repository;

import com.importpotato.baro.menu.domain.Menu;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MenuRepository extends JpaRepository<Menu, Long> {

    List<Menu> findAllByStoreIdOrderByIdAsc(Long storeId);

    Optional<Menu> findByIdAndStoreId(Long menuId, Long storeId);
}
