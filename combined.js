// ==UserScript==
// @name         VGen: Ultimate Enhancement Suite
// @namespace    https://github.com/rhea-manuel/vgen-enhancements
// @version      0.1.0
// @description  Combines Auto-Reveal, Price Hover, and Background Tab clicks into one ultra-optimized script.
// @author       https://github.com/rheactdev
// @match        *://vgen.co/*
// @grant        GM_openInTab
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- 1. INJECT CUSTOM CSS ---
    const style = document.createElement('style');
    style.innerHTML = `
        @keyframes vgenOverlayFadeIn {
            from { opacity: 0; transform: translateY(5px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .injected-price-overlay {
            animation: vgenOverlayFadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        .vgen-custom-badge {
            transition: transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease !important;
            cursor: default;
        }
        .vgen-custom-badge:hover {
            transform: translateY(-2px);
            filter: brightness(1.15);
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
    `;
    document.head.appendChild(style);

    // --- 2. HELPERS ---
    function createSlug(str) {
        if (!str) return '';
        return str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
    }

    // Unified Master Scraper: Runs ONLY once per card and grabs everything
    function getVGenData(element) {
        let fiberKey = Object.keys(element).find(k => k.startsWith('__reactFiber$'));
        if (!fiberKey) return null;

        let queue = [element[fiberKey]];
        let visited = new Set();

        while (queue.length > 0) {
            let node = queue.shift();
            if (!node || visited.has(node)) continue;
            visited.add(node);

            if (visited.size > 250) break; // Safe performance limit

            let p = node.memoizedProps;
            let data = p?.service || p?.product;

            if (data) {
                return {
                    type: p.service ? 'service' : 'product',
                    data: data,
                    mediaUrl: data.galleryItems?.[0]?.url || null,
                    price: data.basePrice || data.price,
                    username: data.user?.username,
                    slug: data.slug,
                    id: data.serviceID || data.productID || data.id || data._id,
                    itemName: data.name || data.serviceName || data.title || data.productName,
                    currency: data.currency || 'USD',
                    licenseInfo: data.licenseInfo,
                    discounts: data.discounts || []
                };
            }

            if (node.child) queue.push(node.child);
            if (node.sibling) queue.push(node.sibling);
            if (node.return) queue.push(node.return);
        }
        return null;
    }

    // --- 3. UNIFIED HOVER HANDLER (Reveal + Price) ---
    document.addEventListener('mouseover', function(e) {
        const card = e.target.closest('[class*="ServiceGridCard__GridCard"], [class*="ProductListing__"]');
        if (!card) return;

        // --- MATURE REVEAL CHECK ---
        const matureWarning = card.querySelector('[class*="MatureContentWarning"]');
        const isWarningVisible = matureWarning && 
                                 matureWarning.offsetHeight > 0 && 
                                 window.getComputedStyle(matureWarning).display !== 'none' &&
                                 window.getComputedStyle(matureWarning).opacity !== '0' &&
                                 window.getComputedStyle(matureWarning).visibility !== 'hidden';

        let needsReveal = false;
        if (isWarningVisible && !card.dataset.revealed) {
            needsReveal = true;
            card.dataset.revealed = "processing";
        } else if (!isWarningVisible && !card.dataset.revealed) {
            card.dataset.revealed = "not-mature"; // Mark safe cards
        }

        // --- PRICE REVEAL CHECK ---
        let needsPrice = (card.dataset.priceFetched !== "true" && card.dataset.pricePending !== "true");

        // If neither action is needed, stop entirely to save CPU
        if (!needsReveal && !needsPrice) return;

        // --- FETCH DATA (CACHED) ---
        if (!card.vgenData) {
            card.vgenData = getVGenData(card);
        }
        const vData = card.vgenData;

        if (!vData) {
            if (needsReveal) card.dataset.revealed = "error";
            if (needsPrice) card.dataset.priceFetched = "false";
            return;
        }

        const thumbContainer = card.querySelector('[class*="ThumbnailContainer"]');
        if (!thumbContainer) return;

        // === EXECUTE INSTANT IMAGE REVEAL ===
        if (needsReveal && vData.mediaUrl) {
            matureWarning.style.transition = "opacity 0.2s ease-in-out";
            matureWarning.style.opacity = "0";

            const isVideo = vData.mediaUrl.endsWith('.webm') || vData.mediaUrl.endsWith('.mp4');
            let injectedMedia = isVideo ? document.createElement('video') : document.createElement('img');

            injectedMedia.src = vData.mediaUrl; 
            if (isVideo) {
                injectedMedia.autoplay = true;
                injectedMedia.loop = true;
                injectedMedia.muted = true;
                injectedMedia.playsInline = true;
            }

            injectedMedia.className = "vgen-revealed-media";
            injectedMedia.style.cssText = `
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                object-fit: cover; z-index: 5; border-radius: inherit;
                pointer-events: none; opacity: 0; transition: opacity 0.2s ease-in-out;
            `;

            if (window.getComputedStyle(thumbContainer).position === 'static') {
                thumbContainer.style.position = 'relative';
            }
            thumbContainer.appendChild(injectedMedia);

            requestAnimationFrame(() => injectedMedia.style.opacity = "1");
            setTimeout(() => { if(matureWarning.parentNode) matureWarning.remove(); }, 200);

            card.dataset.revealed = "done";
        }

        // === EXECUTE DELAYED PRICE REVEAL ===
        if (needsPrice) {
            card.dataset.pricePending = "true";

            setTimeout(async () => {
                // Smart check: did the user hover away?
                if (!card.matches(':hover')) {
                    card.dataset.pricePending = "false";
                    return;
                }

                card.dataset.priceFetched = "true";
                if (window.getComputedStyle(thumbContainer).position === 'static') {
                    thumbContainer.style.position = 'relative';
                }

                const overlayDiv = document.createElement('div');
                overlayDiv.className = "injected-price-overlay";
                overlayDiv.style.cssText = `
                    position: absolute; bottom: 0; left: 0; right: 0;
                    background: linear-gradient(to top, rgba(18, 9, 13, 0.95) 0%, rgba(18, 9, 13, 0.8) 50%, transparent 100%);
                    padding: 30px 12px 10px 12px; color: #fff;
                    display: flex; flex-direction: column; gap: 6px; z-index: 10;
                    border-bottom-left-radius: inherit; border-bottom-right-radius: inherit;
                `;

                const priceLine = document.createElement('div');
                priceLine.style.cssText = "display: flex; align-items: center; gap: 8px; pointer-events: none;";
                const priceTag = document.createElement('span');
                priceTag.style.cssText = "color: #B8FF26; font-weight: 900; font-size: 1.1rem; text-shadow: 0 1px 3px rgba(0,0,0,0.8);";
                
                priceLine.appendChild(priceTag);
                overlayDiv.appendChild(priceLine);

                const badgesContainer = document.createElement('div');
                badgesContainer.style.cssText = "display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px;";

                const createBadge = (text, colorHex) => {
                    const badge = document.createElement('span');
                    badge.className = "vgen-custom-badge"; 
                    badge.style.cssText = `
                        font-size: 0.65rem; font-weight: 700; background: ${colorHex}22; color: ${colorHex}; 
                        border: 1px solid ${colorHex}55; padding: 2px 6px; border-radius: 4px; 
                        text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;
                        text-shadow: 0 1px 2px rgba(0,0,0,0.5); pointer-events: auto;
                    `;
                    badge.innerText = text;
                    return badge;
                };

                if (vData.licenseInfo) {
                    const comm = vData.licenseInfo.commercialContent;
                    const merch = vData.licenseInfo.commercialMerchandising;

                    if ((!comm || !comm.isEnabled) && (!merch || !merch.isEnabled)) {
                        badgesContainer.appendChild(createBadge("♥ PERSONAL USE ONLY", "#9ca3af"));
                    } else {
                        if (comm && comm.isEnabled) {
                            badgesContainer.appendChild(createBadge(comm.isExtraCost ? "$ COM: EXTRA" : "✓ COM: INCL", comm.isExtraCost ? "#facc15" : "#4ade80"));
                        } else {
                            badgesContainer.appendChild(createBadge("✕ COM", "#9ca3af"));
                        }

                        if (merch && merch.isEnabled) {
                            badgesContainer.appendChild(createBadge(merch.isExtraCost ? "$ MERCH: EXTRA" : "✓ MERCH: INCL", merch.isExtraCost ? "#facc15" : "#4ade80"));
                        } else {
                            badgesContainer.appendChild(createBadge("✕ MERCH", "#9ca3af"));
                        }
                    }
                    overlayDiv.appendChild(badgesContainer);
                }

                thumbContainer.appendChild(overlayDiv);

                const updateDisplay = (basePriceObj) => {
                    const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: vData.currency });
                    priceTag.innerText = `From ${formatter.format(basePriceObj / 100)}`;

                    if (vData.discounts && vData.discounts.length > 0) {
                        const now = new Date();
                        const activeDiscount = vData.discounts.find(d => {
                            const start = d.startDate ? new Date(d.startDate) : new Date(0);
                            const end = d.endDate ? new Date(d.endDate) : new Date(8640000000000000);
                            return now >= start && now <= end;
                        });

                        if (activeDiscount) {
                            const discountVal = activeDiscount.percentage ? `${activeDiscount.percentage}% OFF` : 
                                                activeDiscount.amount ? `-${formatter.format(activeDiscount.amount / 100)}` : 'SALE';
                            const saleBadge = document.createElement('span');
                            saleBadge.className = "vgen-custom-badge";
                            saleBadge.style.cssText = "background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; pointer-events: auto;";
                            saleBadge.innerText = discountVal;
                            priceLine.appendChild(saleBadge);
                        }
                    }
                };

                if (vData.price) {
                    updateDisplay(vData.price);
                } else if (vData.username && vData.slug) {
                    priceTag.innerText = "⏳ ...";
                    try {
                        const fetchUrl = `/${vData.username}/service/${vData.slug}/${vData.id}`;
                        const response = await fetch(fetchUrl);
                        const htmlText = await response.text();
                        const match = htmlText.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
                        if (match) {
                            const json = JSON.parse(match[1]);
                            const fetchedPrice = json?.props?.pageProps?.service?.basePrice || json?.props?.pageProps?.service?.price;
                            if (fetchedPrice) updateDisplay(fetchedPrice); 
                            else overlayDiv.remove();
                        }
                    } catch (err) {
                        overlayDiv.remove();
                        card.dataset.priceFetched = "false";
                    }
                }
                
                const oldTag = card.querySelector('.injected-price-tag');
                if (oldTag) oldTag.remove();

            }, 300);
        }
    });

    // --- 4. CLICK HANDLER (Background Tab) ---
    document.addEventListener('click', function(e) {
        if (!e.target || !e.target.closest) return;

        const card = e.target.closest('[class*="ProductListing"], [class*="ServiceListing"], [class*="GridCard"], [class*="ServiceCard"]');
        if (!card) return;

        // Fetch data (will be instant if you already hovered over it!)
        if (!card.vgenData) {
            card.vgenData = getVGenData(card);
        }
        const vData = card.vgenData;

        if (vData && vData.username && vData.itemName && vData.id) {
            e.preventDefault();
            e.stopPropagation();

            const slug = vData.slug || createSlug(vData.itemName);
            const url = `https://vgen.co/${vData.username}/${vData.type}/${slug}/${vData.id}`;

            GM_openInTab(url, { active: false, insert: true });
        }
    }, true); // Capture phase to intercept before React router

})();
