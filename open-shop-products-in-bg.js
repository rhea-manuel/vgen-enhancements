// ==UserScript==
// @name         VGen: Open Products in Background Tab
// @namespace    https://github.com/rhea-manuel/vgen-enhancements
// @version      1.0
// @description  Combines React memory scanning and Network Interception to force background tabs.
// @author       https://github.com/rhea-manuel
// @match        *://vgen.co/*
// @grant        GM_openInTab
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // 1. Aggressive React Memory Scanner
    function findUrlFromReact(element) {
        let el = element.closest('.productListing');
        if (!el) return null;

        let fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
        if (!fiberKey) return null;

        let visited = new Set();
        let queue = [el[fiberKey]];

        // Scan children, parents, and siblings for hidden URL props
        while (queue.length > 0) {
            let node = queue.shift();
            if (!node || visited.has(node)) continue;
            visited.add(node);

            if (visited.size > 250) break; // Failsafe limit

            let p = node.memoizedProps;
            if (p) {
                if (typeof p.href === 'string' && (p.href.startsWith('/') || p.href.startsWith('http'))) return p.href;
                if (p.product && p.product.slug) return `/shop/product/${p.product.slug}`;
                if (p.service && p.service.slug) return `/${p.service.user?.username || 'user'}/${p.service.slug}`;
            }

            if (node.child) queue.push(node.child);
            if (node.return) queue.push(node.return);
            if (node.sibling) queue.push(node.sibling);
        }
        return null;
    }

    // 2. Intercept the Click
    document.addEventListener('click', function(e) {
        const card = e.target.closest('.productListing');
        if (card) {
            const extractedUrl = findUrlFromReact(e.target);

            if (extractedUrl) {
                // SUCCESS! Found the URL directly.
                // Kill the click instantly so the site doesn't even know it happened.
                e.stopPropagation();
                e.preventDefault();

                const fullUrl = new URL(extractedUrl, window.location.origin).href;
                GM_openInTab(fullUrl, { active: false, insert: true });
            } else {
                // FALLBACK: Flag the network interceptor to catch the routing requests
                window.__vgenProductClicked = true;
                setTimeout(() => { window.__vgenProductClicked = false; }, 1000);
            }
        }
    }, true); // Capture phase stops the click early

    // 3. Fallback Network Interceptor (Catches the API requests you saw in the console)
    const origFetch = window.fetch;
    window.fetch = async function(resource, init) {
        if (window.__vgenProductClicked && typeof resource === 'string') {

            let targetUrl = null;

            // If it fetches Next.js page data
            if (resource.includes('/_next/data/')) {
                try {
                    const urlObj = new URL(resource, window.location.origin);
                    const parts = urlObj.pathname.split('/');
                    if (parts[1] === '_next' && parts[2] === 'data') {
                        targetUrl = '/' + parts.slice(4).join('/').replace(/\.json$/, '');
                        targetUrl = urlObj.origin + targetUrl + urlObj.search;
                    }
                } catch(err) {}
            }
            // If it fetches the VGen API for the product (like the 404 error you spotted!)
            else if (resource.includes('/api.vgen.co/shop/product/')) {
                const idMatches = resource.match(/([a-f0-9\-]{36})/i);
                if (idMatches) {
                    targetUrl = window.location.origin + '/shop/product/' + idMatches[1];
                }
            }

            if (targetUrl) {
                window.__vgenProductClicked = false; // Reset flag

                GM_openInTab(targetUrl, { active: false, insert: true });

                // Reject the fetch. This starves Next.js of the data it needs to change the page,
                // silently aborting the navigation in the current tab!
                return Promise.reject(new TypeError("Blocked by Greasemonkey to stop tab navigation."));
            }
        }
        return origFetch.apply(this, arguments);
    };
})();
