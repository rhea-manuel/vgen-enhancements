// ==UserScript==
// @name         VGen: Hover Price Revealer (Permanent Display)
// @namespace    https://github.com/rhea-manuel/vgen-enhancements
// @version      1.0
// @description  Fetches prices on hover and keeps them displayed on the card.
// @author       https://github.com/rhea-manuel
// @match        *://vgen.co/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    function scanCardData(element) {
        let fiberKey = Object.keys(element).find(k => k.startsWith('__reactFiber$'));
        if (!fiberKey) return null;
        let queue = [element[fiberKey]];
        let visited = new Set();
        while (queue.length > 0) {
            let node = queue.shift();
            if (!node || visited.has(node)) continue;
            visited.add(node);
            if (visited.size > 300) break;
            let p = node.memoizedProps;
            if (p && p.service) {
                return {
                    price: p.service.basePrice || p.service.price,
                    username: p.service.user?.username,
                    slug: p.service.slug,
                    id: p.service.serviceID || p.service.id
                };
            }
            if (node.child) queue.push(node.child);
            if (node.return) queue.push(node.return);
            if (node.sibling) queue.push(node.sibling);
        }
        return null;
    }

    let hoverTimer = null;

    document.addEventListener('mouseover', function(e) {
        const card = e.target.closest('[class*="ServiceGridCard__GridCard"], [class*="ProductListing__"]');
        if (!card) return;

        // If price is already being fetched or displayed, do nothing
        if (card.dataset.priceFetched === "true") return;

        hoverTimer = setTimeout(async () => {
            if (card.querySelector('.injected-price-tag')) return;
            card.dataset.priceFetched = "true";

            const data = scanCardData(card);
            if (!data) {
                card.dataset.priceFetched = "false";
                return;
            }

            const priceDiv = document.createElement('div');
            priceDiv.className = "injected-price-tag";
            priceDiv.style.cssText = `
                display: inline-block;
                background: #12090d;
                color: #B8FF26;
                padding: 2px 8px;
                border-radius: 4px;
                border: 1px solid #B8FF26;
                font-weight: 900;
                font-size: 0.9rem;
                margin-top: 5px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
                white-space: nowrap;
                width: fit-content;
            `;

            // Injection: Place it in the info section so it flows with the text
            const infoContainer = card.querySelector('[class*="ServiceInfoContainer"]') || card.querySelector('.infoContainer') || card;
            infoContainer.appendChild(priceDiv);

            const updateText = (val) => { priceDiv.innerText = `From $${(val / 100).toFixed(2)}`; };

            if (data.price) {
                updateText(data.price);
            } else if (data.username && data.slug) {
                priceDiv.innerText = "⏳ ...";
                try {
                    const fetchUrl = `/${data.username}/service/${data.slug}/${data.id}`;
                    const response = await fetch(fetchUrl);
                    const htmlText = await response.text();
                    const match = htmlText.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
                    if (match) {
                        const json = JSON.parse(match[1]);
                        const price = json?.props?.pageProps?.service?.basePrice || json?.props?.pageProps?.service?.price;
                        if (price) updateText(price); else priceDiv.remove();
                    }
                } catch (err) {
                    priceDiv.remove();
                    card.dataset.priceFetched = "false";
                }
            }
        }, 300);
    }, true);

    document.addEventListener('mouseout', function(e) {
        if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
        }
    }, true);

})();
