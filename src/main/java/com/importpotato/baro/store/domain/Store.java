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

    @Column(name = "mon_closed")
    private Boolean monClosed;

    @Column(name = "tue_open")
    private LocalTime tueOpen;

    @Column(name = "tue_close")
    private LocalTime tueClose;

    @Column(name = "tue_closed")
    private Boolean tueClosed;

    @Column(name = "wed_open")
    private LocalTime wedOpen;

    @Column(name = "wed_close")
    private LocalTime wedClose;

    @Column(name = "wed_closed")
    private Boolean wedClosed;

    @Column(name = "thu_open")
    private LocalTime thuOpen;

    @Column(name = "thu_close")
    private LocalTime thuClose;

    @Column(name = "thu_closed")
    private Boolean thuClosed;

    @Column(name = "fri_open")
    private LocalTime friOpen;

    @Column(name = "fri_close")
    private LocalTime friClose;

    @Column(name = "fri_closed")
    private Boolean friClosed;

    @Column(name = "sat_open")
    private LocalTime satOpen;

    @Column(name = "sat_close")
    private LocalTime satClose;

    @Column(name = "sat_closed")
    private Boolean satClosed;

    @Column(name = "sun_open")
    private LocalTime sunOpen;

    @Column(name = "sun_close")
    private LocalTime sunClose;

    @Column(name = "sun_closed")
    private Boolean sunClosed;

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

    public void updateBusinessHours(
            LocalTime monOpen,
            LocalTime monClose,
            Boolean monClosed,
            LocalTime tueOpen,
            LocalTime tueClose,
            Boolean tueClosed,
            LocalTime wedOpen,
            LocalTime wedClose,
            Boolean wedClosed,
            LocalTime thuOpen,
            LocalTime thuClose,
            Boolean thuClosed,
            LocalTime friOpen,
            LocalTime friClose,
            Boolean friClosed,
            LocalTime satOpen,
            LocalTime satClose,
            Boolean satClosed,
            LocalTime sunOpen,
            LocalTime sunClose,
            Boolean sunClosed
    ) {
        this.monOpen = monOpen;
        this.monClose = monClose;
        this.monClosed = monClosed;
        this.tueOpen = tueOpen;
        this.tueClose = tueClose;
        this.tueClosed = tueClosed;
        this.wedOpen = wedOpen;
        this.wedClose = wedClose;
        this.wedClosed = wedClosed;
        this.thuOpen = thuOpen;
        this.thuClose = thuClose;
        this.thuClosed = thuClosed;
        this.friOpen = friOpen;
        this.friClose = friClose;
        this.friClosed = friClosed;
        this.satOpen = satOpen;
        this.satClose = satClose;
        this.satClosed = satClosed;
        this.sunOpen = sunOpen;
        this.sunClose = sunClose;
        this.sunClosed = sunClosed;
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

    public LocalTime getMonOpen() {
        return monOpen;
    }

    public LocalTime getMonClose() {
        return monClose;
    }

    public Boolean getMonClosed() {
        return monClosed;
    }

    public LocalTime getTueOpen() {
        return tueOpen;
    }

    public LocalTime getTueClose() {
        return tueClose;
    }

    public Boolean getTueClosed() {
        return tueClosed;
    }

    public LocalTime getWedOpen() {
        return wedOpen;
    }

    public LocalTime getWedClose() {
        return wedClose;
    }

    public Boolean getWedClosed() {
        return wedClosed;
    }

    public LocalTime getThuOpen() {
        return thuOpen;
    }

    public LocalTime getThuClose() {
        return thuClose;
    }

    public Boolean getThuClosed() {
        return thuClosed;
    }

    public LocalTime getFriOpen() {
        return friOpen;
    }

    public LocalTime getFriClose() {
        return friClose;
    }

    public Boolean getFriClosed() {
        return friClosed;
    }

    public LocalTime getSatOpen() {
        return satOpen;
    }

    public LocalTime getSatClose() {
        return satClose;
    }

    public Boolean getSatClosed() {
        return satClosed;
    }

    public LocalTime getSunOpen() {
        return sunOpen;
    }

    public LocalTime getSunClose() {
        return sunClose;
    }

    public Boolean getSunClosed() {
        return sunClosed;
    }
}
