package com.importpotato.baro.store.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "stores")
public class Store {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "store_id")
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "store_name", nullable = false, length = 100)
    private String storeName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 50)
    private StoreCategory category;

    @Enumerated(EnumType.STRING)
    @Column(name = "business_type", nullable = false, length = 50)
    private BusinessType businessType;

    @Column(nullable = false)
    private LocalDateTime created;

    @Column(name = "mon_open")
    private LocalTime monOpen;

    @Column(name = "mon_close")
    private LocalTime monClose;

    @Column(name = "tue_open")
    private LocalTime tueOpen;

    @Column(name = "tue_close")
    private LocalTime tueClose;

    @Column(name = "wed_open")
    private LocalTime wedOpen;

    @Column(name = "wed_close")
    private LocalTime wedClose;

    @Column(name = "thu_open")
    private LocalTime thuOpen;

    @Column(name = "thu_close")
    private LocalTime thuClose;

    @Column(name = "fri_open")
    private LocalTime friOpen;

    @Column(name = "fri_close")
    private LocalTime friClose;

    @Column(name = "sat_open")
    private LocalTime satOpen;

    @Column(name = "sat_close")
    private LocalTime satClose;

    @Column(name = "sun_open")
    private LocalTime sunOpen;

    @Column(name = "sun_close")
    private LocalTime sunClose;

    protected Store() {
    }

    private Store(Long userId, String storeName, BusinessType businessType, StoreCategory category, LocalDateTime created) {
        this.userId = userId;
        this.storeName = storeName;
        this.businessType = businessType;
        this.category = category;
        this.created = created;
    }

    public static Store createBasicInfo(Long userId, String storeName, BusinessType businessType, StoreCategory category) {
        return new Store(userId, storeName, businessType, category, LocalDateTime.now());
    }

    public Long getId() {
        return id;
    }

    public Long getUserId() {
        return userId;
    }

    public String getStoreName() {
        return storeName;
    }

    public StoreCategory getCategory() {
        return category;
    }

    public BusinessType getBusinessType() {
        return businessType;
    }

    public LocalDateTime getCreated() {
        return created;
    }
}
