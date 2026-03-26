// ==UserScript==
// @name         VGen: Ultimate Enhancement Suite
// @namespace    https://github.com/rheactdev/vgen-enhancements
// @version      0.3.0
// @description  Combines Auto-Reveal, Price Hover, and Background Tab clicks into one ultra-optimized script.
// @author       https://github.com/rheactdev
// @match        *://vgen.co/*
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // --- 0. CONFIGURATION & STATE MANAGEMENT ---
    let openInBackground = GM_getValue('vgen_bg_tabs_enabled', true);
    let autoRevealEnabled = GM_getValue('vgen_auto_reveal_enabled', true);
    let bgMenuId, revealMenuId;

    function renderMenus() {
        if (typeof bgMenuId !== 'undefined') GM_unregisterMenuCommand(bgMenuId);
        if (typeof revealMenuId !== 'undefined') GM_unregisterMenuCommand(revealMenuId);

        bgMenuId = GM_registerMenuCommand(`Background Tabs: ${openInBackground ? 'ON' : 'OFF'}`, () => {
            openInBackground = !openInBackground;
            GM_setValue('vgen_bg_tabs_enabled', openInBackground);
            renderMenus(); // Re-render to update UI text
        });

        revealMenuId = GM_registerMenuCommand(`Auto-Reveal Sensitive: ${autoRevealEnabled ? 'ON' : 'OFF'}`, () => {
            autoRevealEnabled = !autoRevealEnabled;
            GM_setValue('vgen_auto_reveal_enabled', autoRevealEnabled);
            renderMenus(); // Re-render to update UI text
        });
    }
    renderMenus();

    // --- 1. OFFLOADED CSS (Hardware Accelerated) ---
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes vgenOverlayFadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .vgen-price-overlay {
            position: absolute; bottom: 0; left: 0; right: 0;
            background: linear-gradient(to top, rgba(18, 9, 13, 0.95) 0%, rgba(18, 9, 13, 0.8) 50%, transparent 100%);
            padding: 30px 12px 10px 12px; color: #fff; display: flex; flex-direction: column;
            gap: 6px; z-index: 10; border-bottom-left-radius: inherit; border-bottom-right-radius: inherit;
            animation: vgenOverlayFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
            will-change: opacity, transform;
        }
        .vgen-price-text {
            color: #B8FF26; font-weight: 900; font-size: 1.1rem; text-shadow: 0 1px 3px rgba(0,0,0,0.8);
        }
        .vgen-revealed-media {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            object-fit: cover; z-index: 5; border-radius: inherit; pointer-events: none;
            opacity: 0; transition: opacity 0.2s ease-in-out; will-change: opacity;
        }
        .vgen-custom-badge {
            font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;
            text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5); pointer-events: auto;
            transition: transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease;
            cursor: default;
        }
        .vgen-custom-badge:hover {
            transform: translateY(-2px); filter: brightness(1.15); box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
    `;
    document.head.appendChild(style);

    // --- 2. HELPERS & HIGH-SPEED SCRAPER ---
    function createSlug(str) {
        return (str || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    }

    function getVGenData(cardElement) {
        let fiberKey;
        for (const key in cardElement) {
            if (key.startsWith('__reactFiber$')) {
                fiberKey = key;
                break;
            }
        }
        if (!fiberKey) return null;

        let node = cardElement[fiberKey];

        for (let depth = 0; depth < 50; depth++) {
            if (!node) break;

            let p = node.memoizedProps;
            let rawData = p?.service || p?.product;

            if (rawData && (rawData.user || rawData.userModeration) && (rawData.serviceID || rawData.productID || rawData.id || rawData._id)) {
                return {
                    type: p.service ? 'service' : 'product',
                    mediaUrl: rawData.galleryItems?.[0]?.url || null,
                    price: rawData.basePrice || rawData.price,
                    username: rawData.user?.username || rawData.userModeration?.username,
                    slug: rawData.slug || createSlug(rawData.name || rawData.serviceName || rawData.title || rawData.productName),
                    id: rawData.serviceID || rawData.productID || rawData.id || rawData._id,
                    itemName: rawData.name || rawData.serviceName || rawData.title || rawData.productName,
                    currency: rawData.currency || 'USD',
                    licenseInfo: rawData.licenseInfo || null,
                    discounts: rawData.discounts || []
                };
            }
            node = node.return;
        }
        return null;
    }

    // --- 3. DOM CACHING & REVEAL LOGIC ---
    function getCardDOM(card) {
        if (!card.vgenDOM) {
            card.vgenDOM = {
                thumb: card.querySelector('[class*="ThumbnailContainer"]'),
                warning: card.querySelector('[class*="MatureContentWarning"]')
            };
        }
        return card.vgenDOM;
    }

    function executeImageReveal(card, vData, dom) {
        if (card.dataset.imageRevealed === "true") return;

        const matureWarning = dom.warning;
        if (!matureWarning) return;

        card.dataset.imageRevealed = "true";
        if (!dom.thumb || !vData.mediaUrl) return;

        matureWarning.style.transition = "opacity 0.2s ease-in-out";
        matureWarning.style.opacity = "0";

        const isVideo = vData.mediaUrl.endsWith('.webm') || vData.mediaUrl.endsWith('.mp4');
        let injectedMedia = isVideo ? document.createElement('video') : document.createElement('img');

        injectedMedia.src = vData.mediaUrl;
        if (isVideo) {
            injectedMedia.autoplay = true; injectedMedia.loop = true;
            injectedMedia.muted = true; injectedMedia.playsInline = true;
        }

        injectedMedia.className = "vgen-revealed-media";

        if (window.getComputedStyle(dom.thumb).position === 'static') {
            dom.thumb.style.position = 'relative';
        }
        dom.thumb.appendChild(injectedMedia);

        requestAnimationFrame(() => injectedMedia.style.opacity = "1");
        setTimeout(() => { if (matureWarning.parentNode) matureWarning.remove(); }, 200);
    }

    function createBadgeHTML(text, colorHex) {
        return `<span class="vgen-custom-badge" style="background: ${colorHex}22; color: ${colorHex}; border: 1px solid ${colorHex}55;">${text}</span>`;
    }

    function executePriceReveal(card, vData, dom) {
        if (card.dataset.priceRevealed === "true" || !dom.thumb) return;
        card.dataset.priceRevealed = "true";

        if (window.getComputedStyle(dom.thumb).position === 'static') {
            dom.thumb.style.position = 'relative';
        }

        let badgesHtml = '';

        if (vData.licenseInfo) {
            const comm = vData.licenseInfo.commercialContent;
            const merch = vData.licenseInfo.commercialMerchandising;

            if ((!comm || !comm.isEnabled) && (!merch || !merch.isEnabled)) {
                badgesHtml += createBadgeHTML("♥ PERSONAL USE ONLY", "#9ca3af");
            } else {
                badgesHtml += createBadgeHTML(comm?.isEnabled ? (comm.isExtraCost ? "$ COM: EXTRA" : "✓ COM: INCL") : "✕ COM", comm?.isEnabled ? (comm.isExtraCost ? "#facc15" : "#4ade80") : "#9ca3af");
                badgesHtml += createBadgeHTML(merch?.isEnabled ? (merch.isExtraCost ? "$ MERCH: EXTRA" : "✓ MERCH: INCL") : "✕ MERCH", merch?.isEnabled ? (merch.isExtraCost ? "#facc15" : "#4ade80") : "#9ca3af");
            }

            const standardKeys = ['personal', 'commercialContent', 'commercialMerchandising'];
            if (Object.keys(vData.licenseInfo).some(key => !standardKeys.includes(key))) {
                badgesHtml += createBadgeHTML("+ CUSTOM LICENSES", "#c084fc");
            }
        } else {
            badgesHtml += createBadgeHTML("? CUSTOM TERMS", "#c084fc");
        }

        let priceText = "Custom Price";
        let discountHtml = '';

        if (vData.price) {
            const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: vData.currency });
            priceText = `From ${formatter.format(vData.price / 100)}`;

            if (vData.discounts && vData.discounts.length > 0) {
                const now = new Date();
                const activeDiscount = vData.discounts.find(d => {
                    const start = d.startDate ? new Date(d.startDate) : new Date(0);
                    const end = d.endDate ? new Date(d.endDate) : new Date(8640000000000000);
                    return now >= start && now <= end;
                });

                if (activeDiscount) {
                    let discountVal = 'SALE';
                    if (activeDiscount.percentage) {
                        const pct = activeDiscount.percentage < 1 ? activeDiscount.percentage * 100 : activeDiscount.percentage;
                        discountVal = `${pct}% OFF`;
                    } else if (activeDiscount.amount) {
                        discountVal = `-${formatter.format(activeDiscount.amount / 100)}`;
                    }
                    discountHtml = `<span class="vgen-custom-badge" style="background:#ef4444;color:white;border:none;">${discountVal}</span>`;
                }
            }
        }

        const overlayDiv = document.createElement('div');
        overlayDiv.className = "vgen-price-overlay";
        overlayDiv.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px; pointer-events:none;">
                <span class="vgen-price-text">${priceText}</span>
                ${discountHtml}
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">
                ${badgesHtml}
            </div>
        `;

        dom.thumb.appendChild(overlayDiv);

        const oldTag = card.querySelector('.injected-price-tag');
        if (oldTag) oldTag.remove();
    }

    // --- 4. ZERO-LAG DELEGATED EVENTS ---
    let currentHoveredCard = null;

    document.addEventListener('mouseover', function (e) {
        const card = e.target.closest('[class*="ServiceGridCard__GridCard"], [class*="ProductListing__"]');
        if (!card || card === currentHoveredCard) return;

        currentHoveredCard = card;

        if (!card.vgenData) {
            card.vgenData = getVGenData(card);
        }

        const vData = card.vgenData;
        if (!vData) return;

        const dom = getCardDOM(card);

        if (autoRevealEnabled) {
            executeImageReveal(card, vData, dom);
        }

        if (card.dataset.priceRevealed !== "true") {
            card.hoverTimer = setTimeout(() => {
                if (currentHoveredCard === card) {
                    executePriceReveal(card, vData, dom);
                }
            }, 300);
        }
    });

    document.addEventListener('mouseout', function (e) {
        if (!currentHoveredCard) return;

        if (currentHoveredCard.contains(e.relatedTarget)) return;

        if (currentHoveredCard.hoverTimer) {
            clearTimeout(currentHoveredCard.hoverTimer);
            currentHoveredCard.hoverTimer = null;
        }
        currentHoveredCard = null;
    });

    // --- 5. CLICK HANDLER (Background Tab) ---
    document.addEventListener('click', function (e) {
        if (!openInBackground) return;
        if (!e.target || !e.target.closest) return;

        const card = e.target.closest('[class*="ProductListing"], [class*="ServiceGridCard__GridCard"]');
        if (!card) return;

        // EXCLUSION FILTER: Ensure standard React synthetic events handle localized card interactions
        const interactiveChild = e.target.closest('button, [role="button"], a:not([class*="GridCard"]):not([class*="ProductListing"]), svg');
        if (interactiveChild && card.contains(interactiveChild)) {
            return;
        }

        if (!card.vgenData) card.vgenData = getVGenData(card);
        const vData = card.vgenData;

        if (vData && vData.username && vData.itemName && vData.id) {
            e.preventDefault();
            e.stopPropagation();

            const url = `https://vgen.co/${vData.username}/${vData.type}/${vData.slug}/${vData.id}`;
            GM_openInTab(url, { active: false, insert: true });
        }
    }, true); // Capturing phase execution maintained for primary card clicks

})();