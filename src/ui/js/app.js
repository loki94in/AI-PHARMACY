/**
 * AI Pharmacy OS - Core Application Logic
 * Vanilla JS SPA Router
 */

const pageConfigs = {
    dashboard: { title: 'Dashboard', subtitle: 'Overview & Real-time Analytics' },
    pos: { title: 'POS Billing', subtitle: 'Main Counter & Smart Assistance' },
    rush: { title: 'Rush Hour Sales', subtitle: 'Fast Bulk Entry (No Patient Details)' },
    inventory: { title: 'Inventory Master', subtitle: 'Stock Control & Tracking' },
    purchases: { title: 'Purchases', subtitle: 'Distributor Billing & Logs' },
    crm: { title: 'CRM & Patients', subtitle: 'Patient History & Refills' },
    settings: { title: 'Settings', subtitle: 'System Preferences & Integrations' }
};

class AppRouter {
    constructor() {
        this.contentContainer = document.getElementById('page-content');
        this.navItems = document.querySelectorAll('.nav-item');
        this.headerTitle = document.getElementById('header-title');
        this.headerSubtitle = document.getElementById('header-subtitle');
        this.loadedPages = new Map();
        
        this.init();
    }

    init() {
        // Add click listeners to sidebar
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const route = item.getAttribute('data-route');
                if (route) this.navigate(route);
            });
        });

        // Load default route
        this.navigate('dashboard');
    }

    async navigate(route) {
        // Update Active State in Sidebar
        this.navItems.forEach(item => {
            if (item.getAttribute('data-route') === route) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Update Header
        const config = pageConfigs[route] || { title: route, subtitle: '' };
        this.headerTitle.textContent = config.title;
        this.headerSubtitle.textContent = config.subtitle;

        // Hide all current views
        const views = this.contentContainer.querySelectorAll('.view-container');
        views.forEach(v => v.classList.remove('active'));

        // Load or show the view
        if (this.loadedPages.has(route)) {
            this.loadedPages.get(route).classList.add('active');
        } else {
            await this.loadPage(route);
        }
    }

    async loadPage(route) {
        try {
            const response = await fetch(`/ui/pages/${route}.html`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const html = await response.text();
            
            // Create container
            const container = document.createElement('div');
            container.className = 'view-container active';
            container.id = `view-${route}`;
            container.innerHTML = html;
            
            this.contentContainer.appendChild(container);
            this.loadedPages.set(route, container);
            
            // Trigger specific page initializers if they exist
            if (window[`init${route.charAt(0).toUpperCase() + route.slice(1)}`]) {
                window[`init${route.charAt(0).toUpperCase() + route.slice(1)}`]();
            }
        } catch (error) {
            console.error(`Failed to load page ${route}:`, error);
            
            const errorContainer = document.createElement('div');
            errorContainer.className = 'view-container active';
            errorContainer.innerHTML = `
                <div class="card" style="text-align: center; border-color: var(--danger);">
                    <i class="fa-solid fa-triangle-exclamation text-accent" style="font-size: 48px; color: var(--danger); margin-bottom: 16px;"></i>
                    <h3>Under Construction</h3>
                    <p class="text-muted">The ${route} module is currently being migrated to the new design system.</p>
                </div>
            `;
            this.contentContainer.appendChild(errorContainer);
            this.loadedPages.set(route, errorContainer);
        }
    }
}

// Initialize App when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AppRouter();
});
