// ==UserScript==
// @name         VGen: Open Products in Background Tab
// @namespace    https://github.com/rhea-manuel/vgen-enhancements
// @version      1.2
// @description  Intercepts clicks on product cards and opens them in a background tab.
// @author       https://github.com/rhea-manuel
// @match        *://vgen.co/*
// @grant        GM_openInTab
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 1. Our trusty slugifier
    function createSlug(str) {
        return str
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');
    }

    // 2. React Fiber scanner adjusted for "product"
    function scanProductData(element) {
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

            // Check if this node holds the product object
            if (p && p.product) {
                return p.product;
            }

            if (node.child) queue.push(node.child);
            if (node.return) queue.push(node.return);
            if (node.sibling) queue.push(node.sibling);
        }
        return null;
    }

    // 3. Click Interceptor
    // We use 'true' for the capture phase to catch the click before VGen's internal router does
    document.addEventListener('click', function(e) {
        // Find the closest card container (adjust classes if VGen changes them)
        const card = e.target.closest('[class*="ProductListing__"], [class*="GridCard"]');
        if (!card) return;

        const product = scanProductData(card);

        // If we found a product, intercept the click
        if (product && product.productName && product.user && product.user.username) {

            // Prevent the default link navigation and stop the event from bubbling
            e.preventDefault();
            e.stopPropagation();

            // Build the URL pieces
            const username = product.user.username;
            const slug = createSlug(product.productName);
            const productId = product.productID || product._id; // Fallback to _id just in case

            // Construct the final URL
            const url = `https://vgen.co/${username}/product/${slug}/${productId}`;

            // Open in a background tab (active: false means it won't steal focus)
            GM_openInTab(url, { active: false, insert: true });
        }
    }, true);

})();
