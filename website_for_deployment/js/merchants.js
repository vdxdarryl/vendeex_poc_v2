/**
 * VendeeX 2.0 - Merchants Page JavaScript
 * Handles merchant directory display, search, and filtering
 */

// Initialize ACP Service if not already available
const acpService = window.acpService || new ACPService();

// DOM Elements
const merchantsGrid = document.getElementById('merchantsGrid');
const merchantSearch = document.getElementById('merchantSearch');
const searchBtn = document.getElementById('searchBtn');
const categoryFilter = document.getElementById('categoryFilter');
const protocolFilter = document.getElementById('protocolFilter');
const statusFilter = document.getElementById('statusFilter');
const merchantCount = document.getElementById('merchantCount');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');

// Current state
let allMerchants = [];
let filteredMerchants = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async function() {
    await loadMerchants();

    // Event listeners
    searchBtn.addEventListener('click', applyFilters);
    merchantSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyFilters();
    });
    categoryFilter.addEventListener('change', applyFilters);
    protocolFilter.addEventListener('change', applyFilters);
    statusFilter.addEventListener('change', applyFilters);
});

/**
 * Load merchants from ACP service
 */
async function loadMerchants() {
    showLoading(true);

    try {
        allMerchants = await acpService.searchMerchants({ limit: 50 });
        filteredMerchants = [...allMerchants];
        renderMerchants(filteredMerchants);
    } catch (error) {
        console.error('Error loading merchants:', error);
        showError('Failed to load merchants. Please try again.');
    } finally {
        showLoading(false);
    }
}

/**
 * Apply search and filter criteria
 */
async function applyFilters() {
    const searchQuery = merchantSearch.value.trim().toLowerCase();
    const category = categoryFilter.value.toLowerCase();
    const protocol = protocolFilter.value;
    const status = statusFilter.value;

    filteredMerchants = allMerchants.filter(merchant => {
        // Search filter
        if (searchQuery) {
            const matchesSearch =
                merchant.name.toLowerCase().includes(searchQuery) ||
                merchant.description.toLowerCase().includes(searchQuery) ||
                merchant.categories.some(c => c.toLowerCase().includes(searchQuery));
            if (!matchesSearch) return false;
        }

        // Category filter
        if (category) {
            const matchesCategory = merchant.categories.some(c =>
                c.toLowerCase().includes(category)
            );
            if (!matchesCategory) return false;
        }

        // Protocol filter
        if (protocol !== 'all') {
            if (!merchant.protocols.includes(protocol)) return false;
        }

        // Status filter
        if (status !== 'all') {
            if (merchant.acpStatus !== status) return false;
        }

        return true;
    });

    renderMerchants(filteredMerchants);
}

/**
 * Render merchant cards to the grid
 */
function renderMerchants(merchants) {
    merchantCount.textContent = merchants.length;

    if (merchants.length === 0) {
        merchantsGrid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    merchantsGrid.innerHTML = merchants.map(merchant => createMerchantCard(merchant)).join('');

    // Add click handlers
    merchantsGrid.querySelectorAll('.merchant-card').forEach(card => {
        card.addEventListener('click', () => {
            const merchantId = card.dataset.merchantId;
            showMerchantDetails(merchantId);
        });
    });
}

/**
 * Create merchant card HTML
 */
function createMerchantCard(merchant) {
    const statusBadge = '<span class="status-badge active">Active</span>';

    const protocolBadges = merchant.protocols.map(p =>
        `<span class="protocol-badge ${p.toLowerCase()}">${p}</span>`
    ).join('');

    const categoryTags = merchant.categories.slice(0, 3).map(c =>
        `<span class="category-tag">${c}</span>`
    ).join('');

    const stars = generateStars(merchant.rating);

    return `
        <div class="merchant-card acp-active" data-merchant-id="${merchant.id}">
            <div class="acp-badge">ACP Ready</div>
            <div class="merchant-header">
                <div class="merchant-logo">
                    ${merchant.logo.startsWith('/')
                        ? `<img src="..${merchant.logo}" alt="${merchant.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                           <span class="logo-placeholder" style="display:none;">${merchant.name.charAt(0)}</span>`
                        : `<span class="logo-placeholder">${merchant.name.charAt(0)}</span>`
                    }
                </div>
                <div class="merchant-info">
                    <h3>${escapeHtml(merchant.name)}</h3>
                    <div class="merchant-rating">
                        <span class="stars">${stars}</span>
                        <span class="rating-text">${merchant.rating} (${formatNumber(merchant.reviewCount)})</span>
                    </div>
                </div>
            </div>
            <p class="merchant-description">${escapeHtml(merchant.description)}</p>
            <div class="merchant-categories">
                ${categoryTags}
            </div>
            <div class="merchant-footer">
                <div class="protocol-badges">
                    ${protocolBadges}
                </div>
                ${statusBadge}
            </div>
            <div class="merchant-actions">
                <a href="${merchant.website}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm" onclick="event.stopPropagation();">
                    Visit Store
                </a>
                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); startCheckout('${merchant.id}');">
                    Buy with AI
                </button>
            </div>
        </div>
    `;
}

/**
 * Show merchant details modal
 */
async function showMerchantDetails(merchantId) {
    const merchant = allMerchants.find(m => m.id === merchantId);
    if (!merchant) return;

    // Get full details
    let details;
    try {
        details = await acpService.getMerchantDetails(merchantId);
    } catch (error) {
        details = merchant;
    }

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-content merchant-modal">
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove();">&times;</button>

            <div class="modal-header">
                <div class="merchant-logo large">
                    <span class="logo-placeholder">${merchant.name.charAt(0)}</span>
                </div>
                <div>
                    <h2>${escapeHtml(merchant.name)}</h2>
                    <a href="${merchant.website}" target="_blank" rel="noopener noreferrer" class="merchant-website">
                        ${merchant.website}
                    </a>
                </div>
            </div>

            <p class="merchant-description">${escapeHtml(merchant.description)}</p>

            <div class="details-grid">
                <div class="detail-section">
                    <h4>Categories</h4>
                    <div class="merchant-categories">
                        ${merchant.categories.map(c => `<span class="category-tag">${c}</span>`).join('')}
                    </div>
                </div>

                <div class="detail-section">
                    <h4>Supported Protocols</h4>
                    <div class="protocol-list">
                        ${merchant.protocols.map(p => `
                            <div class="protocol-item">
                                <span class="protocol-badge ${p.toLowerCase()}">${p}</span>
                                <span>${p === 'ACP' ? 'Full Checkout Support' : 'Product Discovery'}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="detail-section">
                    <h4>Capabilities</h4>
                    <ul class="capabilities-list">
                        <li class="${details.capabilities?.checkout ? 'enabled' : 'disabled'}">
                            ${details.capabilities?.checkout ? '&#x2713;' : '&#x2717;'} AI Checkout
                        </li>
                        <li class="${details.capabilities?.wishlist ? 'enabled' : 'disabled'}">
                            ${details.capabilities?.wishlist ? '&#x2713;' : '&#x2717;'} Wishlist
                        </li>
                        <li class="${details.capabilities?.returns ? 'enabled' : 'disabled'}">
                            ${details.capabilities?.returns ? '&#x2713;' : '&#x2717;'} Returns
                        </li>
                    </ul>
                </div>

                <div class="detail-section">
                    <h4>Payment Methods</h4>
                    <div class="payment-methods">
                        ${(details.supportedPaymentMethods || ['stripe']).map(method => `
                            <span class="payment-badge">${formatPaymentMethod(method)}</span>
                        `).join('')}
                    </div>
                </div>
            </div>

            <div class="modal-actions">
                <a href="${merchant.website}" target="_blank" rel="noopener noreferrer" class="btn btn-outline">
                    Visit Store
                </a>
                <button class="btn btn-primary" onclick="startCheckout('${merchant.id}'); this.closest('.modal-overlay').remove();">
                    Start AI Buying
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    // Close on escape
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

/**
 * Start checkout flow with merchant
 */
function startCheckout(merchantId) {
    // Redirect to demo page with merchant context
    window.location.href = `demo.html?merchant=${merchantId}&mode=acp`;
}

// Helper functions
function showLoading(show) {
    loadingState.style.display = show ? 'flex' : 'none';
    merchantsGrid.style.display = show ? 'none' : 'grid';
}

function showError(message) {
    merchantsGrid.innerHTML = `
        <div class="error-state">
            <div class="error-icon">&#x26A0;</div>
            <h3>Error</h3>
            <p>${escapeHtml(message)}</p>
            <button class="btn btn-primary" onclick="loadMerchants()">Try Again</button>
        </div>
    `;
}

function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    let stars = '';

    for (let i = 0; i < fullStars; i++) {
        stars += '&#x2605;';
    }
    if (hasHalfStar) {
        stars += '&#x2606;';
    }
    for (let i = fullStars + (hasHalfStar ? 1 : 0); i < 5; i++) {
        stars += '&#x2606;';
    }

    return stars;
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(0) + 'K';
    }
    return num.toString();
}

function formatPaymentMethod(method) {
    const methods = {
        stripe: 'Stripe',
        apple_pay: 'Apple Pay',
        google_pay: 'Google Pay',
        paypal: 'PayPal',
        klarna: 'Klarna'
    };
    return methods[method] || method;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
